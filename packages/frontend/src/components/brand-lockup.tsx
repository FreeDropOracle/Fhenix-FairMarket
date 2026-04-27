import Image from "next/image";
import Link from "next/link";

export function BrandWordmark() {
  return (
    <Link className="shell-brand" href="/">
      <div className="brand-mark">
        <Image
          src="/brand/fhenix-fairmarket-mark.png"
          alt="Fhenix-FairMarket mark"
          fill
          priority
          sizes="52px"
        />
      </div>
      <div className="brand-copy">
        <p className="brand-title">Fhenix-FairMarket</p>
        <p className="brand-subtitle">Auction Protocol</p>
      </div>
    </Link>
  );
}

export function BrandLockup() {
  return (
    <aside className="brand-lockup" aria-label="Brand lockup">
      <div className="brand-crest">
        <Image
          src="/brand/fhenix-fairmarket-mark.png"
          alt="Fhenix-FairMarket phoenix and scales crest"
          fill
          priority
          sizes="(max-width: 860px) 100vw, 480px"
        />
      </div>
      <div className="brand-footnote">
        <div>
          <strong>Confidential flow</strong>
          Escrow first. Sealed bids next.
        </div>
        <div>
          <strong>Single-network release</strong>
          Clear switching. No ambiguity.
        </div>
      </div>
    </aside>
  );
}

export function HeroCrest() {
  return (
    <div className="hero-crest" aria-hidden="true">
      <div className="hero-crest__frame">
        <Image
          src="/brand/fhenix-fairmarket-mark.png"
          alt=""
          fill
          priority
          sizes="(max-width: 860px) 180px, 240px"
        />
      </div>
    </div>
  );
}
