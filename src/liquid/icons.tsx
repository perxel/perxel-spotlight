// Inline icons (Lucide's shapes, ISC), so the skin needs no icon package.

import type {SVGProps} from "react"

function Icon({children, ...props}: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  )
}

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></Icon>
export const XIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></Icon>
export const ArrowUpIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></Icon>
export const ArrowDownIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></Icon>
export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></Icon>
export const ArrowUpRightIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M7 7h10v10"/><path d="M7 17 17 7"/></Icon>
export const CornerDownLeftIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/></Icon>
export const SquareIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><rect width="18" height="18" x="3" y="3" rx="2"/></Icon>
export const SquarePenIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>
  </Icon>
)
export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>
export const FileTextIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
    <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
    <path d="M10 9H8"/>
    <path d="M16 13H8"/>
    <path d="M16 17H8"/>
  </Icon>
)
