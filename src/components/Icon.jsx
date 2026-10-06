// Icons are ligature text ("bookmark_added"), so hide them from screen readers.
export const Icon = ({ children, className = "" }) => <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{children}</span>;
