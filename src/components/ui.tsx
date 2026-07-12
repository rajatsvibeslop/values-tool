export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-head"><div><h1 className="page-title">{title}</h1><p className="page-description">{description}</p></div>{actions}</div>;
}

export function Panel({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-head"><h2 className="panel-title">{title}</h2>{action}</div>}<div className="panel-body">{children}</div></section>;
}

export function Metric({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return <div className="panel metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div>{detail && <div className="metric-detail">{detail}</div>}</div>;
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><strong>{title}</strong><div>{children}</div></div>;
}
