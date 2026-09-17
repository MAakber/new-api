import type { ImgHTMLAttributes } from 'react'

type IconCodeBuddyProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'height' | 'src' | 'width'
> & {
  size?: number
}

export function IconCodeBuddy({
  size = 20,
  alt = '',
  ...props
}: IconCodeBuddyProps) {
  return (
    <img
      src='/codebuddy.png'
      alt={alt}
      width={size}
      height={size}
      aria-hidden={alt ? undefined : true}
      {...props}
    />
  )
}
