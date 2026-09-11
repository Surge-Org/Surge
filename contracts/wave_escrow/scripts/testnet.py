#!/usr/bin/env python3
"""Deploy and exercise wave_escrow using Circle's valueless Stellar testnet USDC.

Prerequisites: Stellar CLI, a compiled Wasm, two funded testnet identities, and
at least 1.3 test USDC on the sponsor. The recipient must initially lack a USDC
trustline. Keys stay in the CLI config directory and never enter this report.
This script hard-codes testnet; it cannot deploy to or spend money on mainnet.
"""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import time

USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'
ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stellar', default='stellar')
    parser.add_argument('--config-dir', required=True)
    parser.add_argument('--wasm', required=True)
    parser.add_argument('--sponsor', required=True)
    parser.add_argument('--recipient', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    output = pathlib.Path(args.report)
    if output.exists():
        parser.error('Report already exists; use a new report path and fresh test identities')
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {'network': 'Stellar testnet', 'asset': 'Circle test USDC', 'asset_has_financial_value': False,
              'usdc_contract': USDC, 'issuer': ISSUER, 'wasm_sha256': hashlib.sha256(pathlib.Path(args.wasm).read_bytes()).hexdigest(),
              'steps': [], 'complete': False}

    def save():
        output.write_text(json.dumps(report, indent=2) + '\n')

    def run(label, argv, expected_error=None):
        print(label, flush=True)
        command = [args.stellar, '--config-dir', args.config_dir, *argv]
        result = subprocess.run(command, text=True, capture_output=True, timeout=180)
        public_command = ['stellar', '--config-dir', '<private-config>', *argv]
        record = {'label': label, 'command': public_command, 'returncode': result.returncode,
                  'stdout': result.stdout, 'stderr': result.stderr,
                  'transaction_hashes': list(dict.fromkeys(re.findall(r'(?:Signing transaction: |/tx/)([0-9a-f]{64})', result.stderr)))}
        report['steps'].append(record)
        save()
        if expected_error:
            assert result.returncode != 0, 'expected a failed invocation'
            assert expected_error in result.stdout + result.stderr, result.stderr
            return None
        if result.returncode:
            raise RuntimeError(result.stderr)
        text = result.stdout.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text

    def invoke(label, address, identity, function, **kwargs):
        tail = []
        for key, value in kwargs.items():
            if isinstance(value, (list, dict)):
                value = json.dumps(value, separators=(',', ':'))
            tail += ['--' + key.replace('_', '-'), str(value)]
        return run(label, ['contract', 'invoke', '--id', address, '--source', identity,
                           '--network', 'testnet', '--cost', '--', function, *tail])

    def wait_until(timestamp):
        while time.time() <= timestamp:
            remaining = timestamp - time.time()
            print(f'Waiting for wave deadline: {max(0, remaining):.0f}s', flush=True)
            time.sleep(min(20, max(1, remaining + 1)))

    report['cli_version'] = run('CLI version', ['--version'])
    sponsor = run('Sponsor public address', ['keys', 'address', args.sponsor])
    recipient = run('Recipient public address', ['keys', 'address', args.recipient])
    report['sponsor'] = sponsor
    report['recipient'] = recipient
    derived = run('Verify Circle asset binding', ['contract', 'id', 'asset', '--network', 'testnet', '--asset', 'USDC:' + ISSUER])
    assert derived == USDC
    before = int(invoke('Read sponsor starting balance', USDC, args.sponsor, 'balance', id=sponsor))
    assert before >= 13_000_000, 'Fund sponsor from Circle testnet faucet first'
    escrow = run('Deploy wave_escrow to testnet', ['contract', 'deploy', '--wasm', args.wasm,
                  '--optimize=false', '--source', args.sponsor, '--network', 'testnet', '--', '--usdc', USDC])
    report['contract_id'] = escrow
    save()
    closes_at = int(time.time()) + 100
    wave = invoke('Create funded wave', escrow, args.sponsor, 'create', manager=sponsor, closes_at=closes_at,
                  grace_seconds=300, dust_recipient=sponsor)
    invoke('Fund wave', escrow, args.sponsor, 'fund', id=wave, sponsor=sponsor, value=10_000_000)
    invoke('Open wave', escrow, args.sponsor, 'open', id=wave)
    invoke('Top up open wave', escrow, args.sponsor, 'fund', id=wave, sponsor=sponsor, value=1)
    wait_until(closes_at + 6)
    invoke('Close wave', escrow, args.sponsor, 'close', id=wave)
    invoke('Settle proportional allocations', escrow, args.sponsor, 'settle', id=wave,
           shares=[{'recipient': recipient, 'points': 1}, {'recipient': sponsor, 'points': 2}])
    allocation = int(invoke('Read recipient allocation', escrow, args.sponsor, 'allocation', id=wave, recipient=recipient))
    assert allocation == 3_333_333
    run('Claim without trustline must fail distinctly', ['contract', 'invoke', '--id', escrow, '--source', args.recipient,
        '--network', 'testnet', '--', 'claim', '--id', str(wave), '--recipient', recipient], expected_error='Contract, #12')
    assert int(invoke('Verify failed claim preserved allocation', escrow, args.sponsor, 'allocation', id=wave, recipient=recipient)) == allocation
    invoke('Recipient creates test USDC trustline', USDC, args.recipient, 'trust', addr=recipient)
    assert int(invoke('Recipient retries claim', escrow, args.recipient, 'claim', id=wave, recipient=recipient)) == allocation
    assert int(invoke('Sponsor pulls allocation plus dust', escrow, args.sponsor, 'claim', id=wave, recipient=sponsor)) == 6_666_668
    assert int(invoke('Verify settled escrow empty', USDC, args.sponsor, 'balance', id=escrow)) == 0
    cancel_id = invoke('Create cancellable wave', escrow, args.sponsor, 'create', manager=sponsor,
                       closes_at=int(time.time())+120, grace_seconds=30, dust_recipient=sponsor)
    invoke('Fund cancellable wave', escrow, args.sponsor, 'fund', id=cancel_id, sponsor=sponsor, value=2_000_000)
    invoke('Cancel wave', escrow, args.sponsor, 'cancel', id=cancel_id)
    assert int(invoke('Refund sponsor', escrow, args.sponsor, 'refund', id=cancel_id, sponsor=sponsor)) == 2_000_000
    expiry_at = int(time.time()) + 40
    expired_id = invoke('Create never-opened wave', escrow, args.sponsor, 'create', manager=sponsor,
                        closes_at=expiry_at, grace_seconds=1, dust_recipient=sponsor)
    invoke('Fund never-opened wave', escrow, args.sponsor, 'fund', id=expired_id, sponsor=sponsor, value=1_000_000)
    wait_until(expiry_at + 7)
    assert int(invoke('Reclaim after grace window', escrow, args.sponsor, 'refund', id=expired_id, sponsor=sponsor)) == 1_000_000
    assert int(invoke('Verify final escrow empty', USDC, args.sponsor, 'balance', id=escrow)) == 0
    recipient_balance = int(invoke('Verify recipient balance', USDC, args.recipient, 'balance', id=recipient))
    sponsor_balance = int(invoke('Verify sponsor balance', USDC, args.sponsor, 'balance', id=sponsor))
    assert recipient_balance == allocation
    assert sponsor_balance + recipient_balance == before
    report['complete'] = True
    report['final_balances'] = {'sponsor': sponsor_balance, 'recipient': recipient_balance, 'escrow': 0}
    save()
    print(f'Verified testnet deployment: {escrow}', flush=True)


if __name__ == '__main__':
    main()
