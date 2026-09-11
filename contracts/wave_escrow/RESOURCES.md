# Resource measurements

Measured with soroban-sdk 27.0.6 and the compiled release Wasm, rather than native
contract functions. Full output is in [evidence/test-output.txt](evidence/test-output.txt).
The maximum tested wave has 64 active sponsors, 64 point recipients and a separate
positive dust allocation. The one-recipient comparison has one sponsor and no dust.

| Invocation | Point recipients / sponsors | Instructions | Memory bytes | Disk reads | Memory reads | Writes | Disk read bytes | Write bytes | Event bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fund | 1 / 1 | 873,577 | 1,275,770 | 1 | 9 | 5 | 92 | 1,208 | 428 |
| settle | 1 / 1 | 819,846 | 1,254,894 | 0 | 6 | 3 | 0 | 764 | 688 |
| claim | 1 / 1 | 888,130 | 1,279,927 | 1 | 9 | 5 | 92 | 1,212 | 408 |
| fund | 64 / 64 | 1,351,570 | 1,489,634 | 0 | 9 | 5 | 0 | 1,208 | 428 |
| settle | 64 / 64 | 16,522,468 | 4,864,258 | 0 | 70 | 67 | 0 | 11,004 | 11,408 |
| claim | 64 / 64 | 1,568,004 | 1,563,419 | 1 | 9 | 5 | 92 | 1,212 | 408 |

The SDK enforces its default mainnet resource-limit snapshot on every invocation.
A live `stellar network settings --network testnet` reading on 2026-09-11 is stored
in [evidence/testnet-settings.json](evidence/testnet-settings.json). Both allow
400 million instructions, 41,943,040 memory bytes, 200 disk reads, 200 writes,
200,000 disk-read bytes, 132,096 write bytes and 16,384 event bytes per transaction.
All measured calls fit. The deployed Wasm is 35,414 bytes against the 131,072-byte
contract-code limit. This is a stated 64-recipient bound, not a claim of unbounded
settlement capacity.

Claim has no recipient or sponsor iteration. Its contract reads/writes and full
ledger footprint are constant between the one- and 64-recipient cases; the test
asserts equality of read/write counts, disk bytes, write bytes and event bytes.
CPU and memory estimates are not numerically identical between these test
histories, so these measurements establish a constant ledger footprint and an
O(1) claim algorithm, not an identical fee for every invocation. Expiration,
restoration, account state and network fees can also affect total transaction cost.

The SDK does not model complete transaction-envelope size or all network fees.
The committed testnet receipt provides actual network acceptance of the full
lifecycle at two recipients; the 64-recipient maximum is covered by the compiled
Wasm test with enforced resource limits. Regenerate measurements and simulate
transactions when changing limits or the contract. TTL/archival support remains
in issue #3's scope.
