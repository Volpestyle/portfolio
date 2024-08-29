export const CustomLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => {
  const linkStyle =
    "text-blue-400 hover:text-blue-300 underline hover:no-underline transition-colors duration-200";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkStyle}
    >
      {children}
    </a>
  );
};
