"""Manual browser ownership, lifecycle and authenticated binary VNC relay."""
from __future__ import annotations

import asyncio
import json
import os
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import WebSocket, WebSocketDisconnect

from manual_store import ManualStore


def parent_origins() -> list[str]:
    return [s.strip() for s in os.environ.get('VIEWER_PARENT_ORIGINS', '').split(',')
            if s.strip().startswith(('https://', 'http://localhost:', 'http://127.0.0.1:'))
            and urlsplit(s.strip()).path in ('', '/')]


class ManualSessions:
    def __init__(self):
        self.store: ManualStore | None = None
        self.active: str | None = None
        self.controllers: dict[str, WebSocket] = {}
        self.callback_ready = False

    def start(self):
        data = os.environ.get('SANDBOX_DATA_DIR')
        if data:
            self.store = ManualStore(str(Path(data) / 'manual.sqlite3'))
            self.store.recover()

    async def available(self) -> bool:
        if (not self.store or not self.callback_ready or not parent_origins() or not os.environ.get('SANDBOX_CALLBACK_URL')
                or not os.environ.get('SANDBOX_PUBLIC_URL')
                or not Path(os.environ.get('MANUAL_CHROMIUM_WRAPPER', '/not-configured')).is_file()
                or not (Path(__file__).parent / 'viewer' / 'dist' / 'viewer.js').is_file()):
            return False
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_connection('127.0.0.1', 5901), 2)
            banner = await asyncio.wait_for(reader.readexactly(12), 2)
            writer.close()
            await writer.wait_closed()
            return banner.startswith(b'RFB ')
        except (OSError, TimeoutError, asyncio.IncompleteReadError):
            return False

    async def control(self, job_id: str, sb):
        if not await self.available():
            raise RuntimeError('viewer unavailable')
        self.active = job_id
        self.store.ready(job_id)
        page = sb.main

        def request(req):
            if (req.method == 'POST' and urlsplit(req.url).path.endswith('/transaction')
                    and self.store.get(job_id)['sessionActive']):
                self.store.update(job_id, purchase='in_progress')

        async def response(resp):
            # Do not read arbitrary response bodies or payment request payloads.
            path = urlsplit(resp.url).path
            if '/api/checkout/pub/orderForm/' in path and path.endswith('/transaction'):
                if not self.store.get(job_id)['sessionActive']:
                    return
                if resp.status == 403:
                    self.store.update(job_id, purchase='verification_required')
                elif 200 <= resp.status < 300:
                    self.store.update(job_id, purchase='in_progress')

        sb.context.on('request', request)
        sb.context.on('response', response)
        sb.allow_payment = True  # manual submission now explicitly authorized by the shopper's mode
        try:
            while True:
                r = self.store.get(job_id)
                if not r['sessionActive'] or time.time() * 1000 >= r['viewerExpiresAt']:
                    break
                if 'orderPlaced' in page.url:
                    # A redirect alone is not proof: confirm the group through the merchant API.
                    from urllib.parse import parse_qs
                    group = parse_qs(urlsplit(page.url).query).get('og', [''])[0]
                    if group and len(group) <= 100:
                        orders = await page.evaluate('''async group => {
                          try {
                            const orders = await window.vtexjs.checkout.getOrders(group);
                            return orders.map(o => ({id:o.orderId, group:o.orderGroup}));
                          } catch { return []; }
                        }''', group)
                        order = next((o for o in orders if o.get('group') == group and o.get('id')), None)
                        if order:
                            self.store.update(job_id, purchase='placed', store_order_id=order['id'])
                            break
                await asyncio.sleep(1)
        finally:
            sb.allow_payment = False
            sb.context.remove_listener('request', request)
            sb.context.remove_listener('response', response)
            r = self.store.get(job_id)
            purchase = r['purchase']
            if purchase == 'not_started':
                purchase = 'abandoned'
            elif purchase == 'in_progress':
                purchase = 'unknown'
            self.store.update(job_id, status='done', sessionActive=False, purchase=purchase)
            await self.disconnect(job_id)
            self.active = None

    async def disconnect(self, job_id):
        if ws := self.controllers.pop(job_id, None):
            try:
                await ws.close(code=1000)
            except (RuntimeError, WebSocketDisconnect):
                pass

    async def relay(self, ws: WebSocket, job_id: str):
        protocols = ws.scope.get('subprotocols', [])
        if (not self.store or ws.headers.get('origin') != os.environ.get('SANDBOX_PUBLIC_URL', '').rstrip('/')
                or len(protocols) != 2 or protocols[0] != 'changuito.viewer'
                or not self.store.consume(protocols[1], job_id)):
            await ws.close(code=1008)
            return
        r = self.store.get(job_id)
        if self.active != job_id or not r or not r['sessionActive'] or r['viewerExpiresAt'] <= time.time() * 1000:
            await ws.close(code=1008)
            return
        await self.disconnect(job_id)
        await ws.accept(subprotocol='changuito.viewer')
        self.controllers[job_id] = ws
        writer = None
        tasks = []
        try:
            reader, writer = await asyncio.open_connection('127.0.0.1', 5901)

            async def upstream():
                while True:
                    data = await ws.receive_bytes()
                    if len(data) > 1_048_576:
                        return
                    writer.write(data)
                    await writer.drain()

            async def downstream():
                while data := await reader.read(65536):
                    await ws.send_bytes(data)

            async def expiry():
                while self.active == job_id and self.store.get(job_id)['sessionActive']:
                    if time.time() * 1000 >= r['viewerExpiresAt']:
                        break
                    await asyncio.sleep(1)

            tasks = [asyncio.create_task(fn()) for fn in (upstream, downstream, expiry)]
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        except (OSError, RuntimeError, WebSocketDisconnect):
            pass
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            if writer:
                writer.close()
                await writer.wait_closed()
            if self.controllers.get(job_id) is ws:
                self.controllers.pop(job_id, None)
            try:
                await ws.close()
            except (RuntimeError, WebSocketDisconnect):
                pass

    async def outbox(self):
        while True:
            if self.store:
                # Recover funded starts even if the shopper closed the tab between
                # fee confirmation and /start. The app dispatches through the normal
                # authenticated jobs API; this response contains no shopper secrets.
                def recover_start():
                    request = urllib.request.Request(os.environ['SANDBOX_CALLBACK_URL'],
                        headers={'authorization': 'Bearer ' + os.environ.get('SANDBOX_TOKEN', '')})
                    with urllib.request.urlopen(request, timeout=20) as response:
                        return response.status == 200 and json.load(response).get('ok') is True
                try:
                    self.callback_ready = await asyncio.to_thread(recover_start)
                except Exception:
                    self.callback_ready = False
                for r in self.store.pending():
                    def send():
                        request = urllib.request.Request(
                            os.environ['SANDBOX_CALLBACK_URL'], method='POST',
                            data=json.dumps(self.store.event(r)).encode(),
                            headers={'content-type': 'application/json',
                                     'authorization': 'Bearer ' + os.environ.get('SANDBOX_TOKEN', '')})
                        with urllib.request.urlopen(request, timeout=15) as response:
                            return json.load(response).get('resolved') is True
                    try:
                        if await asyncio.to_thread(send):
                            self.store.delivered(r['job_id'], r['sequence'])
                    except Exception:
                        pass  # retries; never log response bodies, URLs or credentials
            await asyncio.sleep(5)


sessions = ManualSessions()
