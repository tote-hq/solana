import asyncio
import hashlib
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from manual_store import ManualStore


class ManualLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.tmp.name) / 'jobs.sqlite3')
        self.store = ManualStore(self.path)
        self.job, _ = self.store.create('a' * 64, 'buyer')
        self.id = self.job['job_id']

    def tearDown(self):
        self.store.db.close()
        self.tmp.cleanup()

    def ready(self):
        self.store.update(self.id, status='running', preparation='preparing')
        return self.store.ready(self.id)

    def test_idempotent_start_and_owner(self):
        again, created = self.store.create('a' * 64, 'buyer')
        self.assertFalse(created)
        self.assertEqual(again['job_id'], self.id)
        with self.assertRaises(ValueError):
            self.store.create('a' * 64, 'other buyer')

    def test_ready_requires_preparation_and_sets_fixed_deadline(self):
        with self.assertRaises(ValueError):
            self.store.ready(self.id)
        ready = self.ready()
        self.assertEqual(ready['viewerExpiresAt'] - ready['preparedAt'], 900_000)

    def test_cancellation_before_ready_is_durable_tombstone(self):
        cancelled = self.store.cancel(self.id)
        self.assertIsNone(cancelled['preparedAt'])
        self.assertEqual(cancelled['preparation'], 'cancelled')
        self.assertFalse(self.store.create('a' * 64, 'buyer')[1])
        with self.assertRaises(ValueError):
            self.store.ready(self.id)

    def test_after_ready_abandonment_and_decline_keep_earned_fee(self):
        ready = self.ready()
        self.store.update(self.id, purchase='declined')
        stopped = self.store.cancel(self.id)
        self.assertEqual(stopped['preparedAt'], ready['preparedAt'])
        self.assertEqual(stopped['preparation'], 'ready')
        self.assertEqual(stopped['purchase'], 'declined')
        self.assertFalse(stopped['sessionActive'])

    def test_restart_preserves_preparation_and_marks_purchase_unknown(self):
        before = self.ready()
        other = ManualStore(self.path)
        other.recover()
        after = other.get(self.id)
        self.assertEqual(after['preparedAt'], before['preparedAt'])
        self.assertEqual(after['purchase'], 'unknown')
        self.assertFalse(after['sessionActive'])
        other.db.close()

    def test_restart_before_ready_reports_interrupted_without_fee_earned(self):
        self.store.recover()
        r = self.store.get(self.id)
        self.assertEqual(r['preparation'], 'interrupted')
        self.assertIsNone(r['preparedAt'])

    def test_tickets_are_hashed_single_use_and_scoped(self):
        self.ready()
        token = self.store.ticket(self.id)
        raw = self.store.db.execute('select hash from tickets').fetchone()[0]
        self.assertNotEqual(raw, token)
        self.assertEqual(raw, hashlib.sha256(token.encode()).hexdigest())
        self.assertFalse(self.store.consume(token, 'another job'))
        self.assertTrue(self.store.consume(token, self.id))
        self.assertFalse(self.store.consume(token, self.id))

    def test_ticket_expiration_and_replacement(self):
        self.ready()
        old = self.store.ticket(self.id)
        new = self.store.ticket(self.id)
        self.assertFalse(self.store.consume(old, self.id))
        with patch('manual_store.time.time', return_value=time.time() + 61):
            self.assertFalse(self.store.consume(new, self.id))

    def test_session_expiry_prevents_new_tickets(self):
        ready = self.ready()
        with patch('manual_store.time.time', return_value=ready['viewerExpiresAt'] / 1000 + 1):
            with self.assertRaises(ValueError):
                self.store.ticket(self.id)

    def test_outbox_ack_cannot_drop_later_event(self):
        seq = self.store.get(self.id)['sequence']
        self.store.update(self.id, preparation='preparing')
        self.store.delivered(self.id, seq)
        self.assertEqual(len(self.store.pending()), 1)
        self.store.delivered(self.id, self.store.get(self.id)['sequence'])
        self.assertEqual(self.store.pending(), [])

    def test_public_event_cannot_include_credentials(self):
        event = self.store.event(self.store.get(self.id))
        self.assertNotIn('buyer', event)
        self.assertNotIn('password', json.dumps(event))
        self.assertNotIn('card', json.dumps(event))

    def test_database_is_private_to_the_worker(self):
        self.assertEqual(Path(self.path).stat().st_mode & 0o777, 0o600)

    def test_card_grant_is_hashed_reusable_and_replaced(self):
        self.ready()
        token = self.store.card_grant(self.id)
        raw = self.store.db.execute('select hash from card_grants').fetchone()[0]
        self.assertNotEqual(raw, token)
        self.assertEqual(raw, hashlib.sha256(token.encode()).hexdigest())
        self.assertTrue(self.store.card_granted(token, self.id))
        self.assertTrue(self.store.card_granted(token, self.id))
        self.assertFalse(self.store.card_granted(token, 'b' * 32))
        nxt = self.store.card_grant(self.id)
        self.assertFalse(self.store.card_granted(token, self.id))
        self.assertTrue(self.store.card_granted(nxt, self.id))
        event = json.dumps(self.store.event(self.store.get(self.id)))
        self.assertNotIn(token, event)
        self.assertNotIn(nxt, event)

    def test_card_grant_expires_with_the_session(self):
        ready = self.ready()
        token = self.store.card_grant(self.id)
        with patch('manual_store.time.time', return_value=ready['viewerExpiresAt'] / 1000 + 1):
            self.assertFalse(self.store.card_granted(token, self.id))
            with self.assertRaises(ValueError):
                self.store.card_grant(self.id)

    def test_restart_drops_card_grants(self):
        self.ready()
        self.store.card_grant(self.id)
        other = ManualStore(self.path)
        other.recover()
        self.assertEqual(other.db.execute('select count(*) from card_grants').fetchone()[0], 0)
        other.db.close()


class ManualCardBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_worker_shutdown_does_not_swallow_cancellation(self):
        import server
        with tempfile.TemporaryDirectory() as directory:
            store = ManualStore(str(Path(directory) / 'jobs.sqlite3'))
            job, _ = store.create('c' * 64, 'fixture')
            async def blocked(*args, **kwargs):
                await asyncio.Event().wait()
            with patch.object(server.sessions, 'store', store), patch.object(server, 'run_job', blocked):
                task = asyncio.create_task(server.manual_worker(job['job_id'],
                    {'items': [], 'shopper': {}, 'escrow_deadline': int(time.time()) + 3600}))
                await asyncio.sleep(.02)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(task, .5)
                self.assertEqual(store.get(job['job_id'])['preparation'], 'interrupted')
            store.db.close()

    async def test_manual_jobs_reject_a_card_before_launching_browser(self):
        from agent import run_job
        with self.assertRaises(ValueError):
            await run_job([], card={'pan': 'fixture-only'}, on_manual=lambda _: None)

    async def test_manual_jobs_cannot_enable_recordings(self):
        from agent import run_job
        with self.assertRaises(ValueError):
            await run_job([], record=True, on_manual=lambda _: None)

    async def test_card_apply_without_a_browser_is_refused(self):
        from manual import ManualSessions
        with tempfile.TemporaryDirectory() as directory:
            store = ManualStore(str(Path(directory) / 'jobs.sqlite3'))
            job, _ = store.create('d' * 64, 'fixture')
            store.update(job['job_id'], status='running', preparation='preparing')
            store.ready(job['job_id'])
            sessions = ManualSessions()
            sessions.store = store
            sessions.active = job['job_id']
            with self.assertRaises(PermissionError):
                await sessions.apply_card(job['job_id'], {})
            store.db.close()


if __name__ == '__main__':
    unittest.main()
