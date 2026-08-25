const REPOSITORY_URL = 'https://github.com/luoy-oss/PulseView';

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.5c-2.01.44-2.43-.85-2.43-.85-.33-.84-.8-1.06-.8-1.06-.66-.45.05-.44.05-.44.73.05 1.12.75 1.12.75.65 1.11 1.7.79 2.11.6.07-.47.25-.79.46-.97-1.61-.18-3.3-.81-3.3-3.59 0-.79.28-1.44.75-1.95-.08-.18-.33-.92.07-1.92 0 0 .61-.2 2 .75A6.96 6.96 0 0 1 8 3.8c.62 0 1.24.08 1.82.25 1.39-.95 2-.75 2-.75.4 1 .15 1.74.07 1.92.47.51.75 1.16.75 1.95 0 2.79-1.7 3.4-3.32 3.58.26.23.5.68.5 1.38v2.05c0 .21.14.46.55.38A8 8 0 0 0 8 0Z" fill="currentColor" />
    </svg>
  );
}

export function GithubLink() {
  return (
    <nav className="github-link-container" aria-label="PulseView GitHub repository">
      <a className="github-link" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
        <GithubMark />
        <span>PulseView</span>
      </a>
    </nav>
  );
}
