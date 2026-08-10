/**
 * Tela ainda não implementada. Some conforme cada fase é entregue — serve para
 * o app já abrir inteiro e navegável desde o começo.
 */
export function Placeholder({
  title,
  lead,
  next
}: {
  title: string
  lead: string
  next: string
}): React.JSX.Element {
  return (
    <div className="screen screen--scroll">
      <div className="screen__inner">
        <h1 className="screen__title">{title}</h1>
        <p className="screen__lead">{lead}</p>
        <div className="card">
          <h2 className="card__title">Em construção</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13.5 }}>{next}</p>
        </div>
      </div>
    </div>
  )
}
