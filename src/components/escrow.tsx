/**
 * The escrow panel — one wave's state as the contract holds it.
 *
 * This is the surface that has to reconcile: every figure on it should add up
 * against every other one, because the whole reason to put an escrow on a chain is
 * that anyone can check it. So it shows what was announced, what arrived, what has
 * been paid, and what is left, rather than one summary number that requires trust.
 */

import { AlertTriangle } from 'lucide-react';
import { NETWORK, REWARD_ASSET, wavePoolId } from '../lib/stellar';
import {
  PHASE_LABEL, PHASE_NOTE, fundedFraction, paidFraction, unclaimed, wavePhase,
  type Wave,
} from '../lib/wave-pool';
import { AddressPill, Amount, AssetChip } from './chain';

/** A wave's escrow state, in full. */
export function EscrowPanel({ wave }: { wave: Wave }) {
  const phase = wavePhase(wave);
  const funded = fundedFraction(wave);
  const paid = paidFraction(wave);
  const left = unclaimed(wave);
  const contract = wavePoolId();

  return (
    <section className="escrow" aria-label={`Wave ${wave.number} escrow`}>
      <div className="escrow-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>Wave {wave.number} escrow</h3>
          <p className="escrow-note">{PHASE_NOTE[phase]}</p>
        </div>
        <span className="chip">{PHASE_LABEL[phase]}</span>
        <AssetChip asset={REWARD_ASSET} chip />
      </div>

      {/* Track is the announced budget; the beam is what arrived; the ink overlay
          is what has been paid back out. */}
      <div
        className="escrow-bar"
        role="img"
        aria-label={`${funded.toFixed(1)}% funded, ${paid.toFixed(1)}% of the pool paid out`}
      >
        <span className="escrow-bar-fill" style={{ width: `${funded}%` }} />
        {paid > 0 && <span className="escrow-bar-paid" style={{ width: `${(funded * paid) / 100}%` }} />}
      </div>

      <div className="escrow-figures">
        <div className="escrow-fig">
          <p className="label">Announced</p>
          <strong><Amount stroops={wave.budget} code={false} /></strong>
          <small>Budget for the wave</small>
        </div>
        <div className="escrow-fig">
          <p className="label">In escrow</p>
          <strong><Amount stroops={wave.escrowed} code={false} /></strong>
          <small>{funded.toFixed(0)}% of the budget</small>
        </div>
        <div className="escrow-fig">
          <p className="label">Points</p>
          <strong className="num">{wave.total_points || '—'}</strong>
          <small>{wave.total_points ? 'Divides the pool' : 'None awarded yet'}</small>
        </div>
        <div className="escrow-fig">
          <p className="label">{wave.status === 'Closed' ? 'Unclaimed' : 'Paid out'}</p>
          <strong><Amount stroops={wave.status === 'Closed' ? left : wave.paid} code={false} /></strong>
          <small>
            {wave.status === 'Closed'
              ? phase === 'expired' ? 'Returned to the program' : 'Still claimable'
              : 'Nothing pays out until close'}
          </small>
        </div>
      </div>

      <div className="escrow-foot">
        {contract ? (
          <AddressPill value={contract} kind="Pool" />
        ) : (
          <span className="row" style={{ gap: 6 }}>
            <AlertTriangle size={12} aria-hidden="true" />
            Not deployed on {NETWORK.label} — these figures come from preview data
          </span>
        )}
        <span className="spacer" />
        <span>{NETWORK.label}</span>
      </div>
    </section>
  );
}
