import { ExternalLink } from 'lucide-react';
import { awardedPoints } from '../lib/model';
import { PROGRAM } from '../lib/program';
import { NETWORK, REWARD_ASSET, isDeployed, wavePoolId } from '../lib/stellar';
import { contractWave } from '../lib/wave-pool';
import { useApp } from '../lib/store';
import { Item, Page, PageHead, Stagger } from '../components/ui';
import { AddressPill, AssetChip, NetworkBadge, Starfield } from '../components/chain';
import { EscrowPanel } from '../components/escrow';

/**
 * The on-chain surface.
 *
 * Every other page in this preview is about the program — repositories, issues,
 * proposals. This one is about the escrow underneath it: which network, which
 * contract, and where each wave's money actually is. It exists because the claim
 * the program makes ("points split the wave pool in USDC") is only credible if
 * there is somewhere to go and check it.
 */
export function ProgramPage() {
  const { state } = useApp();
  const contract = wavePoolId();
  const deployed = isDeployed();

  // Newest wave first: the one being funded or claimed is what anyone is here for.
  const waves = [...state.waves].sort((a, b) => b.number - a.number);

  return (
    <Page className="onchain">
      <div className="onchain-sky"><Starfield count={110} tile={560} /></div>

      <PageHead
        title="On-chain"
        sub={<>Where each wave&rsquo;s {REWARD_ASSET.code} actually sits, and what decides how it splits.</>}
        action={
          <a
            className="btn sm"
            href="https://developers.stellar.org/docs/build/smart-contracts"
            target="_blank"
            rel="noreferrer noopener"
          >
            Soroban docs<ExternalLink size={13} />
          </a>
        }
      />

      <div className="grid c3">
        <div className="card stat">
          <p className="label">Network</p>
          <strong className="num" style={{ marginTop: 6 }}><NetworkBadge /></strong>
          <small className="mono" title={NETWORK.passphrase}>
            {NETWORK.passphrase}
          </small>
        </div>
        <div className="card stat">
          <p className="label">Reward asset</p>
          <strong style={{ marginTop: 6 }}><AssetChip asset={REWARD_ASSET} chip /></strong>
          <small>Seven decimal places, paid in stroops</small>
        </div>
        <div className="card stat">
          <p className="label">Wave pool</p>
          <strong style={{ marginTop: 6 }}>
            {contract ? <AddressPill value={contract} kind="Pool" /> : <span className="dim">Not deployed</span>}
          </strong>
          <small>
            {deployed
              ? `Escrow contract on ${NETWORK.label}`
              : 'Figures below come from preview data'}
          </small>
        </div>
      </div>

      <section className="section">
        <div className="row section-head">
          <h2>Waves</h2>
          <span className="spacer" />
          <span className="dim">{waves.length} recorded</span>
        </div>
        <Stagger className="col" delay={0.04}>
          {waves.map(wave => (
            <Item key={wave.id} className="onchain-wave">
              <EscrowPanel wave={contractWave(wave, awardedPoints(wave, state))} />
            </Item>
          ))}
        </Stagger>
      </section>

      <section className="section">
        <div className="row section-head"><h2>How a wave settles</h2></div>
        <ol className="onchain-steps">
          <li>
            <strong>Open.</strong> The budget is announced and {REWARD_ASSET.code} is transferred into
            the pool. Anyone can fund it — the contract only cares that the funder
            signed for it.
          </li>
          <li>
            <strong>Award.</strong> As a maintainer accepts work, points are recorded against
            the contributor. Points are additive, so three accepted issues are three
            calls and the contract keeps the sum.
          </li>
          <li>
            <strong>Close.</strong> The escrowed balance is frozen into the pool and a claim
            window opens. Nothing can change the divisor after this, which is why two
            contributors with equal points are paid equally regardless of when they claim.
          </li>
          <li>
            <strong>Claim.</strong> Each contributor takes{' '}
            <span className="mono">pool &times; points / total</span>, floored, once. The
            floor is what guarantees the shares never add up to more than the pool.
          </li>
          <li>
            <strong>Sweep.</strong> After the window closes, the rounding dust and any share
            nobody came back for go back to the program. Not before — the deadline is
            fixed at close, so the window cannot be cut short.
          </li>
        </ol>
        <p className="onchain-foot">
          {PROGRAM.full} runs on {PROGRAM.chain}. The contract is in{' '}
          <span className="mono">contracts/wave-pool</span>, with its invariants and tests
          written down beside it.
        </p>
      </section>
    </Page>
  );
}
