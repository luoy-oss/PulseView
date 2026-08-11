interface Props {
  left: string;
  right: string;
}

export function StatusBar({ left, right }: Props) {
  return (
    <footer className="status-bar">
      <span>{left}</span>
      <span>{right}</span>
    </footer>
  );
}
