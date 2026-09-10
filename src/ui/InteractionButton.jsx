export default function InteractionButton({reason,children,...props}) {
  const label=reason&&typeof children==='string'?`${children}（${reason}）`:undefined
  return <span className="inline-block" title={reason||undefined}><button {...props} disabled={!!reason} title={reason||undefined} aria-label={label}>{children}</button></span>
}
