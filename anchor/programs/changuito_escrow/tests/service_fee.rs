//! Run after `cargo build-sbf`: cargo test --test service_fee -- --include-ignored
use anchor_lang::{AccountDeserialize, InstructionData};
use changuito_escrow::{instruction, service_order_id, Order, SERVICE_FEE};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_address::Address;
use solana_clock::Clock;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::{path::PathBuf, str::FromStr};

fn anchor_key(a: Address) -> anchor_lang::prelude::Pubkey {
    anchor_lang::prelude::Pubkey::new_from_array(a.to_bytes())
}

struct Fixture {
    svm: LiteSVM,
    buyer: Keypair,
    resolver: Keypair,
    program: Address,
    config: Address,
    mint: Address,
    buyer_token: Address,
    treasury_token: Address,
    token: Address,
}

impl Fixture {
    fn new() -> Self {
        let mut svm = LiteSVM::new();
        let program = Address::new_from_array(changuito_escrow::id().to_bytes());
        let binary = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/changuito_escrow.so");
        svm.add_program_from_file(program, binary).unwrap();
        let buyer = Keypair::new();
        let resolver = Keypair::new();
        svm.airdrop(&buyer.pubkey(), 5_000_000_000).unwrap();
        svm.airdrop(&resolver.pubkey(), 1_000_000_000).unwrap();
        let token = Address::from_str("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").unwrap();
        let mint = Address::new_unique();
        let treasury = Address::new_unique();
        let buyer_token = Address::new_unique();
        let treasury_token = Address::new_unique();
        let mut mint_data = vec![0; 82];
        mint_data[36..44].copy_from_slice(&1_000_000u64.to_le_bytes());
        mint_data[44] = 6;
        mint_data[45] = 1;
        svm.set_account(mint, Account { lamports: 3_000_000, data: mint_data, owner: token,
            executable: false, rent_epoch: 0 }).unwrap();
        for (key, owner, amount) in [(buyer_token, buyer.pubkey(), 1_000_000u64), (treasury_token, treasury, 0)] {
            let mut data = vec![0; 165];
            data[..32].copy_from_slice(mint.as_ref());
            data[32..64].copy_from_slice(owner.as_ref());
            data[64..72].copy_from_slice(&amount.to_le_bytes());
            data[108] = 1;
            svm.set_account(key, Account { lamports: 3_000_000, data, owner: token,
                executable: false, rent_epoch: 0 }).unwrap();
        }
        let (config, _) = Address::find_program_address(&[b"config"], &program);
        let initialize = Instruction { program_id: program, accounts: vec![
            AccountMeta::new(buyer.pubkey(), true), AccountMeta::new(config, false),
            AccountMeta::new_readonly(mint, false), AccountMeta::new_readonly(Address::default(), false)],
            data: instruction::Initialize { resolver: anchor_key(resolver.pubkey()), treasury: anchor_key(treasury) }.data() };
        let tx = Transaction::new(&[&buyer], Message::new(&[initialize], Some(&buyer.pubkey())), svm.latest_blockhash());
        svm.send_transaction(tx).unwrap();
        Self { svm, buyer, resolver, program, config, mint, buyer_token, treasury_token, token }
    }

    fn identity(&self, nonce: [u8; 32]) -> [u8; 32] {
        service_order_id(&anchor_key(self.buyer.pubkey()), &nonce)
    }

    fn accounts(&self, id: [u8; 32]) -> (Address, Address) {
        (Address::find_program_address(&[b"order", &id], &self.program).0,
         Address::find_program_address(&[b"vault", &id], &self.program).0)
    }

    fn open(&self, nonce: [u8; 32], id: [u8; 32]) -> Instruction {
        let (order, vault) = self.accounts(id);
        Instruction { program_id: self.program, accounts: vec![
            AccountMeta::new(self.buyer.pubkey(), true), AccountMeta::new_readonly(self.config, false),
            AccountMeta::new_readonly(self.mint, false), AccountMeta::new(self.buyer_token, false),
            AccountMeta::new(order, false), AccountMeta::new(vault, false),
            AccountMeta::new_readonly(self.token, false), AccountMeta::new_readonly(Address::default(), false)],
            data: instruction::OpenServiceFee { order_id: id, nonce, basket_hash: [7; 32], timeout_secs: 3600 }.data() }
    }

    fn send(&mut self, ix: Instruction, resolver: bool) -> bool {
        self.svm.expire_blockhash();
        let signer = if resolver { &self.resolver } else { &self.buyer };
        let tx = Transaction::new(&[signer], Message::new(&[ix], Some(&signer.pubkey())), self.svm.latest_blockhash());
        let result = self.svm.send_transaction(tx);
        if let Err(ref err) = result { eprintln!("{}", err.meta.logs.join("\n")); }
        result.is_ok()
    }

    fn balance(&self, key: Address) -> u64 {
        u64::from_le_bytes(self.svm.get_account(&key).unwrap().data[64..72].try_into().unwrap())
    }

    fn order(&self, id: [u8; 32]) -> Order {
        let data = self.svm.get_account(&self.accounts(id).0).unwrap().data;
        Order::try_deserialize(&mut data.as_slice()).unwrap()
    }

    fn refund(&self, id: [u8; 32], resolver: bool) -> Instruction {
        let (order, vault) = self.accounts(id);
        Instruction { program_id: self.program, accounts: vec![
            AccountMeta::new_readonly(if resolver { self.resolver.pubkey() } else { self.buyer.pubkey() }, true),
            AccountMeta::new_readonly(self.config, false), AccountMeta::new(order, false), AccountMeta::new(vault, false),
            AccountMeta::new(self.buyer_token, false), AccountMeta::new(self.buyer.pubkey(), false),
            AccountMeta::new_readonly(self.token, false)], data: instruction::Refund {}.data() }
    }
}

#[test]
#[ignore = "requires compiled SBF program"]
fn fixed_fee_transfer_identity_and_legacy_settlement() {
    let mut f = Fixture::new();
    let nonce = [1; 32];
    let id = f.identity(nonce);
    assert!(f.send(f.open(nonce, id), false));
    assert_eq!(f.balance(f.buyer_token), 1_000_000 - SERVICE_FEE);
    assert_eq!(f.balance(f.accounts(id).1), SERVICE_FEE);
    assert_eq!(f.order(id).amount, SERVICE_FEE);
    assert!(!f.send(f.open(nonce, id), false));
    let (order, vault) = f.accounts(id);
    let settle = Instruction { program_id: f.program, accounts: vec![
        AccountMeta::new_readonly(f.resolver.pubkey(), true), AccountMeta::new_readonly(f.config, false),
        AccountMeta::new(order, false), AccountMeta::new(vault, false), AccountMeta::new(f.treasury_token, false),
        AccountMeta::new(f.buyer.pubkey(), false), AccountMeta::new_readonly(f.token, false)],
        data: instruction::Settle { basket_hash: [7; 32], receipt_hash: [8; 32] }.data() };
    assert!(f.send(settle, true));
    assert_eq!(f.balance(f.treasury_token), SERVICE_FEE);
    assert_eq!(f.order(id).receipt_hash, [8; 32]);
}

#[test]
#[ignore = "requires compiled SBF program"]
fn wrong_identity_and_owner_are_rejected_atomically() {
    let mut f = Fixture::new();
    assert!(!f.send(f.open([1; 32], [0; 32]), false));
    assert_eq!(f.balance(f.buyer_token), 1_000_000);
    let id = f.identity([2; 32]);
    let mut wrong = f.open([2; 32], id);
    wrong.accounts[0].pubkey = f.resolver.pubkey();
    assert!(!f.send(wrong, true));
    assert_eq!(f.balance(f.buyer_token), 1_000_000);
}

#[test]
#[ignore = "requires compiled SBF program"]
fn resolver_refund_and_buyer_timeout_recovery() {
    let mut f = Fixture::new();
    let id = f.identity([3; 32]);
    assert!(f.send(f.open([3; 32], id), false));
    assert!(!f.send(f.refund(id, false), false));
    assert!(f.send(f.refund(id, true), true));
    assert_eq!(f.balance(f.buyer_token), 1_000_000);
    let next = f.identity([4; 32]);
    assert!(f.send(f.open([4; 32], next), false));
    let mut clock: Clock = f.svm.get_sysvar();
    clock.unix_timestamp += 3601;
    f.svm.set_sysvar(&clock);
    assert!(f.send(f.refund(next, false), false));
    assert_eq!(f.balance(f.buyer_token), 1_000_000);
}
