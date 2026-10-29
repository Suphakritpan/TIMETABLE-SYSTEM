import type { ReactNode } from 'react';

export default function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card" aria-label={title}>
      {(title || actions) && <header className="card-head">{title && <h2>{title}</h2>}<span className="spacer" />{actions}</header>}
      {children}
    </section>
  );
}
