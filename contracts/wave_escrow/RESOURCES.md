# Resource measurements

Measured with soroban-sdk 27.0.6 and the compiled release Wasm, rather than native
contract functions. Full output is in [evidence/test-output.txt](evidence/test-output.txt).
The maximum tested wave has 64 active sponsors, 64 point recipients and a separate
positive dust allocation. The one-recipient comparison has one sponsor and no dust.

| Invocation | Point recipients / sponsors | Instructions | Memory bytes | Disk reads | Memory reads | Writes | Disk read bytes | Write bytes | Event bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fund | 1 / 1 | 881,090 | 1,278,345 | 1 | 9 | 5 | 92 | 1,208 | 488 |
| settle | 1 / 1 | 831,660 | 1,257,547 | 0 | 6 | 3 | 0 | 764 | 752 |
| claim | 1 / 1 | 870,463 | 1,274,506 | 1 | 9 | 5 | 0 | 1,212 | 448 |
| fund | 64 / 64 | 1,359,083 | 1,492,209 | 0 | 9 | 5 | 0 | 1,208 | 488 |
| settle | 64 / 64 | 16,703,288 | 4,873,285 | 0 | 70 | 67 | 0 | 11,004 | 13,528 |
| claim | 64 / 64 | 870,463 | 1,274,506 | 1 | 9 | 5 | 0 | 1,212 | 448 |

The SDK enforces its default mainnet resource-limit snapshot on every invocation.
A live `stellar network settings --network testnet` reading on 2026-09-11 is stored
in [evidence/testnet-settings.json](evidence/testnet-settings.json). Both allow
400 million instructions, 41,943,040 memory bytes, 200 disk reads, 200 writes,
200,000 disk-read bytes, 132,096 write bytes and 16,384 event bytes per transaction.
All measured calls fit. The measured Wasm is 39,029 bytes against the 131,072-byte
contract-code limit. This is a stated 64-recipient bound, not a claim of unbounded
settlement capacity.

Claim has no recipient or sponsor iteration. To compare transaction costs fairly,
the test snapshots the settled ledger and reloads it into a fresh Env before each
claim, just as each network transaction starts in a new host. This excludes the
previous funding/settlement calls' accumulated host objects. CPU, memory,
read/write counts, disk bytes, write bytes and event bytes are exactly equal at
one and 64 recipients; the test asserts all of them. Both claims transfer the
same amount. This establishes constant claim resource usage with respect to wave
size. Expiration, restoration, account state and network fees can still affect
total transaction cost outside that controlled comparison.

The SDK does not model complete transaction-envelope size or all network fees.
The committed testnet receipt provides actual network acceptance of the full
lifecycle at two recipients; the 64-recipient maximum is covered by the compiled
Wasm test with enforced resource limits. Regenerate measurements and simulate
transactions when changing limits or the contract. TTL/archival support remains
in issue #3's scope.
