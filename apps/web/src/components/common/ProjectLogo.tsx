import Avatar from './Avatar';

// A project's logo. With a custom `logoUrl` it shows that image; otherwise it
// falls back to the project name's initials, the same deterministic badge
// Avatar draws for people, but rounded-square instead of a circle.
export default function ProjectLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
}) {
  return <Avatar name={name} image={logoUrl} shape="rounded" className={className} />;
}
