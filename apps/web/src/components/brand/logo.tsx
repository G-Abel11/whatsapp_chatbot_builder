import Image from 'next/image';
import { cn } from 'cn';

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/opes-logo.png"
      alt="OpesChatbot logo"
      width={size}
      height={size}
      priority
      className={cn('shrink-0 rounded-lg', className)}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-[15px] leading-none font-semibold tracking-tight text-title', className)}>
      OpesChatbot
    </span>
  );
}

export function LogoLockup({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={28} />
      <Wordmark />
    </div>
  );
}
