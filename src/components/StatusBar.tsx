import { GithubLink } from './GithubLink';

interface Props {
  left: string;
  right: string;
}

function fmtBuildTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}

export function StatusBar({ left, right }: Props) {
  return (
    <>
      <GithubLink />
      <footer className="status-bar">
        <span>{left}</span>
        <span className="status-right">
          <span
            className="version-badge"
            title={'构建时间 ' + __APP_BUILD_TIME__}
          >
            v{__APP_VERSION__} · {__APP_COMMIT__} ·{' '}
            {fmtBuildTime(__APP_BUILD_TIME__)}
          </span>
          <span>{right}</span>
        </span>
      </footer>
    </>
  );
}
