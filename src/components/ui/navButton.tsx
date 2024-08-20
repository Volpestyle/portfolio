import { usePathname } from "next/navigation";
import { Button } from "./button";
import Link from "next/link";

const NavButton: React.FC<{ href: string; children: React.ReactNode }> = ({
  href,
  children,
}) => {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Button
      variant="onBlack"
      asChild
      className={isActive ? "bg-white bg-opacity-20" : ""}
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
};

export default NavButton;
