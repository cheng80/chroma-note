import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CloudOff,
  Ellipsis,
  Expand,
  Heart,
  Image,
  Info,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { theme } from '../theme';

export type AppIconName =
  | 'arrow-left'
  | 'calendar-days'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'circle-alert'
  | 'circle-check'
  | 'cloud-off'
  | 'ellipsis'
  | 'expand'
  | 'heart'
  | 'image'
  | 'info'
  | 'refresh-cw'
  | 'settings'
  | 'sliders-horizontal'
  | 'trash-2'
  | 'triangle-alert'
  | 'x';

const icons: Record<AppIconName, LucideIcon> = {
  'arrow-left': ArrowLeft,
  'calendar-days': CalendarDays,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  'cloud-off': CloudOff,
  ellipsis: Ellipsis,
  expand: Expand,
  heart: Heart,
  image: Image,
  info: Info,
  'refresh-cw': RefreshCw,
  settings: Settings,
  'sliders-horizontal': SlidersHorizontal,
  'trash-2': Trash2,
  'triangle-alert': TriangleAlert,
  x: X,
};

export type AppIconProps = {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};

export function AppIcon({ name, size = 20, color = theme.colors.ink, strokeWidth = 2, fill = 'none' }: AppIconProps) {
  const Icon = icons[name];
  return <Icon accessible={false} color={color} fill={fill} size={size} strokeWidth={strokeWidth} />;
}
