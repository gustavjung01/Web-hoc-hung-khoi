import { useMemo, useState, useEffect, useCallback } from 'react';
import { useRef } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import ClerkHeaderAuth from './ClerkHeaderAuth';
import AccountPage from './AccountPage';
import AdminLicensesPage from './AdminLicensesPage';
import AdminCustomersPage from './AdminCustomersPage';
import AdminAiCreditsPage from './AdminAiCreditsPage';
import AdminAiSettingsPage from './AdminAiSettingsPage';
import {
  BookOpen,
  GraduationCap,
  PlayCircle,
  UserRound,
  BarChart3,
  Sparkles,
  ChevronRight,
  Search,
  Layers3,
  Target,
  PenTool,
  Calculator,
  LibraryBig,
  Monitor,
  Download,
  Globe,
  Menu,
  X,
  MessageCircle,
  Phone,
  Send,
  ShoppingCart,
  Check,
  ArrowLeft,
  AlertCircle,
  Loader2,
} from 'lucide-react';

// ===== API CONFIG =====
const API_BASE_URL = 'https://hochungkhoi.site/api';

// ===== ASSET HELPER =====
const asset = (path: string) => {
  const base = (import.meta as any).env?.BASE_URL || '/';
  return `${base}${path.replace(/^\/+/, '')}`;
};

// ===== VIETQR HELPER =====
const VIETQR_BANK_ID = 'ACB';
const VIETQR_ACCOUNT = '49312517';
const VIETQR_ACCOUNT_NAME = 'KHUONG VAN BINH';
const VIETQR_FALLBACK = '/payment/qr-acb-49312517-khuong-van-binh.jpg';

const buildVietQRUrl = (amount: number, transferContent: string): string => {
  const baseUrl = `https://img.vietqr.io/image/${VIETQR_BANK_ID}-${VIETQR_ACCOUNT}-compact2.png`;
  const params = new URLSearchParams({
    amount: amount.toString(),
    addInfo: transferContent,
    accountName: VIETQR_ACCOUNT_NAME,
  });
  return `${baseUrl}?${params.toString()}`;
};

// ===== PRODUCT CATALOG TYPES =====
type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number;
  currency: string;
  billingCycle: 'yearly';
  durationMonths: number;
  gradeIds: number[];
  gradeNames: string[];
  maxGrades: number;
  features: string[];
  targetAudience: string;
  isActive: boolean;
  sortOrder: number;
  badge: string | null;
  requiresGradeSelection?: boolean;
  selectionPrompt?: string;
  type?: string;
  credits?: number;
  // UI display properties
  image?: string;
  level?: string;
  shortDescription?: string;
  status?: string;
};

type Order = {
  orderId: string;
  productName: string;
  amount: number;
  status: 'pending' | 'paid';
  expiresAt: string;
  createdAt: string;
  licenseKey?: string | null;
  dopiRechargeKeyMasked?: string | null;
  dopiRechargeKey?: string | null;
  dopiAmount?: number | null;
  dopiRechargeStatus?: string | null;
};

type PaymentInfo = {
  method: string;
  bank: string;
  accountNumber: string;
  accountName: string;
  transferContent: string;
  amount: number;
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

function renderBotMessageContent(content: string) {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: JSX.Element[] = [];
  let paragraphLines: string[] = [];
  let listItems: Array<{ text: string; ordered: boolean }> = [];
  let currentListType: 'ordered' | 'unordered' | null = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) return;

    const paragraphText = paragraphLines.join('\n').trimEnd();
    if (paragraphText) {
      blocks.push(
        <p key={`paragraph-${blocks.length}`} className="whitespace-pre-line leading-6">
          {renderInlineMarkdown(paragraphText)}
        </p>,
      );
    }
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length) return;

    const ListTag = currentListType === 'ordered' ? 'ol' : 'ul';
    blocks.push(
      <ListTag
        key={`list-${blocks.length}`}
        className={currentListType === 'ordered' ? 'list-decimal space-y-1 pl-5' : 'list-disc space-y-1 pl-5'}
      >
        {listItems.map((item, index) => (
          <li key={`${currentListType}-${index}`} className="leading-6">
            {renderInlineMarkdown(item.text)}
          </li>
        ))}
      </ListTag>,
    );

    listItems = [];
    currentListType = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    if (numberedMatch) {
      flushParagraph();
      if (currentListType && currentListType !== 'ordered') {
        flushList();
      }
      currentListType = 'ordered';
      listItems.push({ text: numberedMatch[2], ordered: true });
      return;
    }

    if (bulletMatch) {
      flushParagraph();
      if (currentListType && currentListType !== 'unordered') {
        flushList();
      }
      currentListType = 'unordered';
      listItems.push({ text: bulletMatch[1], ordered: false });
      return;
    }

    flushList();
    paragraphLines.push(line);
  });

  flushParagraph();
  flushList();

  if (!blocks.length) {
    return <p className="whitespace-pre-line leading-6">{renderInlineMarkdown(normalized)}</p>;
  }

  return <div className="space-y-2">{blocks}</div>;
}

const SUPPORT_SESSION_STORAGE_KEY = 'hhk_web_support_session_id';

function getOrCreateSupportSessionId() {
  if (typeof window === 'undefined') return `support_${Date.now()}`;

  const existing = window.localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY);
  if (existing) return existing;

  const nextId = `support_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, nextId);
  return nextId;
}

function AiTypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="inline-flex max-w-[85%] items-center gap-3 rounded-xl bg-[#f0e8d8] px-3 py-2 text-[#1a1207]">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#6a5b46]" />
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6a5b46]">
            Đang trả lời
          </span>
          <div className="mt-1 flex items-center gap-1.5" aria-label="AI đang gõ phím">
            <span className="h-2 w-2 rounded-full bg-[#6a5b46] motion-safe:animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-[#6a5b46] motion-safe:animate-bounce" style={{ animationDelay: '140ms' }} />
            <span className="h-2 w-2 rounded-full bg-[#6a5b46] motion-safe:animate-bounce" style={{ animationDelay: '280ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== DỮ LIỆU APP CARDS =====
type AppCard = {
  id: string;
  name: string;
  level: string;
  levelCode: 'cap1' | 'cap2' | 'cap3';
  classCode: string;
  status: string;
  badge: string | null;
  icon: any;
  image: string | null;
  description: string;
  shortDescription?: string;
  subjects: string[];
  hasWebApp: boolean;
  hasDesktop: boolean;
  link?: string;
  // Product metadata
  productId?: string;
  originalPrice?: number;
  salePrice?: number;
  billingCycle?: 'monthly' | 'yearly';
  discountLabel?: string;
  webAppUrl?: string;
  desktopDownloadUrl?: string;
  isAvailable?: boolean;
  isPaymentReady?: boolean;
};

const appCards: AppCard[] = [
  {
    id: 'lop-6',
    name: 'Học tập Lớp 6',
    level: 'Cấp 2',
    levelCode: 'cap2',
    classCode: 'lop6',
    status: 'Sẵn sàng',
    badge: null,
    icon: Calculator,
    image: 'images/home/app-grade-6.webp',
    description: 'Bản học tập đầu tiên cho học sinh chuẩn bị và bắt đầu lớp 6.',
    subjects: ['Toán', 'Tiếng Anh', 'Ngữ văn'],
    hasWebApp: true,
    hasDesktop: true,
    link: 'https://app.hochungkhoi.site/lop-06/',
  },
  {
    id: 'lop-7',
    name: 'Học tập Lớp 7',
    level: 'Cấp 2',
    levelCode: 'cap2',
    classCode: 'lop7',
    status: 'Sẵn sàng',
    badge: 'Đang có',
    icon: BookOpen,
    image: 'images/home/app-grade-7.webp',
    description: 'Không gian học riêng cho lớp 7 với 8 môn, Dopi AI và app desktop Windows.',
    subjects: ['Toán', 'Ngữ văn', 'Tiếng Anh'],
    hasWebApp: true,
    hasDesktop: true,
    link: 'https://app.hochungkhoi.site/lop-07/',
    productId: 'grade7_12m',
  },
  {
    id: 'lop-8',
    name: 'Học tập Lớp 8',
    level: 'Cấp 2',
    levelCode: 'cap2',
    classCode: 'lop8',
    status: 'Sắp mở',
    badge: null,
    icon: Target,
    image: 'images/home/lop-08.png',
    description: 'Nằm trong lộ trình phát triển Cấp 2, dự kiến sau Lớp 7.',
    subjects: ['Toán', 'Văn', 'Anh', 'KHTN', 'Địa lý'],
    hasWebApp: false,
    hasDesktop: false,
  },
  {
    id: 'lop-9',
    name: 'Học tập Lớp 9',
    level: 'Cấp 2',
    levelCode: 'cap2',
    classCode: 'lop9',
    status: 'Sắp mở',
    badge: null,
    icon: PenTool,
    image: 'images/home/lop-09.png',
    description: 'Chuẩn bị cho kỳ thi vào Cấp 3 với lộ trình ôn tập bài bản.',
    subjects: ['Toán', 'Văn', 'Anh', 'KHTN', 'Lịch sử', 'Địa lý'],
    hasWebApp: false,
    hasDesktop: false,
  },
  {
    id: 'cap-01',
    name: 'Học Tập Cấp 01',
    level: 'Cấp 1',
    levelCode: 'cap1',
    classCode: 'cap1',
    status: 'Sẵn sàng',
    badge: 'Đang có',
    icon: LibraryBig,
    image: 'images/home/app-primary.webp',
    description: 'App học tập cho Lớp 1-5.',
    subjects: ['Toán', 'Tiếng Việt'],
    hasWebApp: true,
    hasDesktop: false,
    link: 'https://app.hochungkhoi.site/cap-01/',
  },
  {
    id: 'lop-10',
    name: 'Học Tập Lớp 10',
    level: 'Cấp 3',
    levelCode: 'cap3',
    classCode: 'lop10',
    status: 'Sắp mở',
    badge: null,
    icon: BookOpen,
    image: 'images/home/app-highschool.webp',
    description: 'Không gian học tập cho học sinh bắt đầu Cấp 3.',
    subjects: ['Toán', 'Văn', 'Anh', 'Lý', 'Hóa'],
    hasWebApp: false,
    hasDesktop: false,
  },
  {
    id: 'lop-11',
    name: 'Học Tập Lớp 11',
    level: 'Cấp 3',
    levelCode: 'cap3',
    classCode: 'lop11',
    status: 'Sắp mở',
    badge: null,
    icon: BookOpen,
    image: 'images/home/app-highschool.webp',
    description: 'Tiếp nối lộ trình học tập Cấp 3.',
    subjects: ['Toán', 'Văn', 'Anh', 'Lý', 'Hóa', 'Sinh'],
    hasWebApp: false,
    hasDesktop: false,
  },
  {
    id: 'lop-12',
    name: 'Học Tập Lớp 12',
    level: 'Cấp 3',
    levelCode: 'cap3',
    classCode: 'lop12',
    status: 'Sắp mở',
    badge: null,
    icon: BookOpen,
    image: 'images/home/app-highschool.webp',
    description: 'Chuẩn bị cho kỳ thi tốt nghiệp THPT.',
    subjects: ['Toán', 'Văn', 'Anh', 'Lý', 'Hóa', 'Sinh'],
    hasWebApp: false,
    hasDesktop: false,
  },
];

// ===== PRODUCT CATALOG =====
const PRODUCT_CATALOG: Product[] = [
  {
    id: 'leaf_grade1_12m',
    name: 'Lớp Lá + Lớp 01',
    description: 'Gói học tập cho học sinh Lớp Lá (mầm non) và Lớp 1, thời hạn 12 tháng',
    price: 299000,
    originalPrice: 349000,
    currency: 'VND',
    billingCycle: 'yearly',
    durationMonths: 12,
    gradeIds: [0, 1],
    gradeNames: ['Lớp Lá', 'Lớp 1'],
    maxGrades: 2,
    features: [
      'Truy cập đầy đủ nội dung Lớp Lá và Lớp 1',
      'Giọng đọc tiêu chuẩn',
      'Luyện tập không giới hạn',
      'Theo dõi tiến độ học tập',
    ],
    targetAudience: 'Học sinh chuẩn bị vào lớp 1, học sinh lớp 1',
    isActive: true,
    sortOrder: 1,
    badge: 'Tiết kiệm 14%',
  },
  {
    id: 'grade2_12m',
    name: 'Lớp 02',
    description: 'Gói học tập cho học sinh Lớp 2, thời hạn 12 tháng',
    price: 299000,
    originalPrice: 349000,
    currency: 'VND',
    billingCycle: 'yearly',
    durationMonths: 12,
    gradeIds: [2],
    gradeNames: ['Lớp 2'],
    maxGrades: 1,
    features: [
      'Truy cập đầy đủ nội dung Lớp 2',
      'Giọng đọc tiêu chuẩn',
      'Luyện tập không giới hạn',
    ],
    targetAudience: 'Học sinh lớp 2',
    isActive: true,
    sortOrder: 2,
    badge: null,
  },
  {
    id: 'grade3_12m',
    name: 'Lớp 03',
    description: 'Gói học tập cho học sinh Lớp 3, thời hạn 12 tháng',
    price: 349000,
    originalPrice: 399000,
    currency: 'VND',
    billingCycle: 'yearly',
    durationMonths: 12,
    gradeIds: [3],
    gradeNames: ['Lớp 3'],
    maxGrades: 1,
    features: [
      'Truy cập đầy đủ nội dung Lớp 3',
      'Giọng đọc tiêu chuẩn',
      'Luyện tập không giới hạn',
    ],
    targetAudience: 'Học sinh lớp 3',
    isActive: true,
    sortOrder: 3,
    badge: null,
  },
  {
    id: 'grade4_12m',
    name: 'Lớp 04',
    description: 'Gói học tập cho học sinh Lớp 4, thời hạn 12 tháng',
    price: 349000,
    originalPrice: 399000,
    currency: 'VND',
    billingCycle: 'yearly',
    durationMonths: 12,
    gradeIds: [4],
    gradeNames: ['Lớp 4'],
    maxGrades: 1,
    features: [
      'Truy cập đầy đủ nội dung Lớp 4',
      'Giọng đọc tiêu chuẩn',
      'Luyện tập không giới hạn',
    ],
    targetAudience: 'Học sinh lớp 4',
    isActive: true,
    sortOrder: 4,
    badge: null,
  },
  {
    id: 'grade5_12m',
    name: 'Lớp 05',
    description: 'Gói học tập cho học sinh Lớp 5, thời hạn 12 tháng',
    price: 349000,
    originalPrice: 399000,
    currency: 'VND',
    billingCycle: 'yearly',
    durationMonths: 12,
    gradeIds: [5],
    gradeNames: ['Lớp 5'],
    maxGrades: 1,
    features: [
      'Truy cập đầy đủ nội dung Lớp 5',
      'Giọng đọc tiêu chuẩn',
      'Luyện tập không giới hạn',
    ],
    targetAudience: 'Học sinh lớp 5',
    isActive: true,
    sortOrder: 5,
    badge: null,
  },
  {
    id: 'grade7_12m',
    name: 'Lớp 07',
    description: 'Gói học tập cho học sinh Lớp 7, thời hạn 12 tháng',
    price: 349000,
    originalPrice: 399000,
    currency: 'VND',
    billingCycle: 'yearly',
    durationMonths: 12,
    gradeIds: [7],
    gradeNames: ['Lớp 7'],
    maxGrades: 1,
    features: [
      'Truy cập đầy đủ nội dung Lớp 7',
      'Dữ liệu bài học đã enrich',
      'Luyện tập không giới hạn',
      'Theo dõi tiến độ học tập',
      'Hỗ trợ kỹ thuật qua Zalo',
    ],
    targetAudience: 'Học sinh lớp 7',
    isActive: true,
    sortOrder: 7,
    badge: null,
  },
  {
    id: 'bundle_3_grades_12m',
    name: 'Gói 03 lớp',
    description: 'Gói học tập linh hoạt - tự chọn 3 lớp bất kỳ, thời hạn 12 tháng. Tiết kiệm hơn mua lẻ.',
    price: 599000,
    originalPrice: 897000,
    currency: 'VND',
    billingCycle: 'yearly',
    durationMonths: 12,
    gradeIds: [0, 1, 2, 3, 4, 5],
    gradeNames: ['Lớp Lá', 'Lớp 1', 'Lớp 2', 'Lớp 3', 'Lớp 4', 'Lớp 5'],
    maxGrades: 3,
    features: [
      'Tự chọn đúng 3 lớp bất kỳ',
      'Truy cập đầy đủ nội dung 3 lớp đã chọn',
      'Giọng đọc tiêu chuẩn',
      'Luyện tập không giới hạn',
      'Tiết kiệm 33% so với mua lẻ',
    ],
    targetAudience: 'Gia đình có nhiều con hoặc học sinh cần ôn tập đa lớp',
    isActive: true,
    sortOrder: 6,
    badge: 'Tiết kiệm 33%',
    requiresGradeSelection: true,
    selectionPrompt: 'Vui lòng chọn đúng 3 lớp bạn muốn học. Sau khi chọn, bạn không thể đổi lớp khác.',
  },
];

type AiPackagePreview = {
  id: string;
  name: string;
  badge: string;
  summary: string;
  price: number;
  dopi: number;
  priceNote: string;
  features: string[];
};

const AI_PACKAGE_PREVIEW: AiPackagePreview[] = [
  {
    id: 'ai_credit_trial',
    name: 'Trải nghiệm',
    badge: 'Bắt đầu',
    summary: 'Phù hợp cho phụ huynh muốn thử nhanh trước khi mua gói lớn.',
    price: 39000,
    dopi: 390,
    priceNote: '1 Dopi = 100đ • Giá bán tham chiếu',
    features: ['Dùng để thử chatbot', 'Giải nghĩa bài cơ bản', 'Nạp nhanh khi cần'],
  },
  {
    id: 'ai_credit_basic',
    name: 'Cơ bản',
    badge: 'Bán chạy',
    summary: 'Cân bằng giữa chi phí và nhu cầu học thường xuyên của gia đình.',
    price: 79000,
    dopi: 790,
    priceNote: 'Tối ưu cho học đều mỗi tuần',
    features: ['Chat hỏi đáp', 'Giải thích bài', 'Tạo luyện tập'],
  },
  {
    id: 'ai_credit_saver',
    name: 'Siêu tiết kiệm',
    badge: 'Tiết kiệm',
    summary: 'Dành cho người dùng dùng AI nhiều, muốn chủ động nạp lớn một lần.',
    price: 119000,
    dopi: 1190,
    priceNote: 'Gói lớn, giá trên 1 Dopi tốt hơn',
    features: ['Dùng dài hạn', 'Ưu tiên tiết kiệm', 'Không phải nạp nhiều lần'],
  },
];

// ===== GRADE SELECTION OPTIONS =====
const GRADE_OPTIONS = [
  { id: 0, name: 'Lớp Lá', icon: '🌱' },
  { id: 1, name: 'Lớp 1', icon: '1️⃣' },
  { id: 2, name: 'Lớp 2', icon: '2️⃣' },
  { id: 3, name: 'Lớp 3', icon: '3️⃣' },
  { id: 4, name: 'Lớp 4', icon: '4️⃣' },
  { id: 5, name: 'Lớp 5', icon: '5️⃣' },
];

// ===== HIGHLIGHTS - GIÁ TRỊ HỆ SINH THÁI =====
const highlights = [
  { icon: Globe, title: 'WebApp dùng nhanh', text: 'Không cần cài đặt, mở trình duyệt là học ngay.' },
  { icon: Download, title: 'Desktop học offline', text: 'Tải bản desktop để học không cần mạng.' },
  { icon: Layers3, title: 'Mỗi lớp có trang riêng', text: 'Nội dung được phân theo lớp, không lẫn lộn.' },
  { icon: BarChart3, title: 'Dữ liệu có cấu trúc', text: 'Bài học, luyện tập, tiến độ được tổ chức rõ ràng.' },
];

// ===== HƯỚNG DẪN SỬ DỤNG =====
const usageSteps = [
  { icon: Search, title: 'Chọn app học tập', text: 'Tìm app phù hợp với cấp học và lớp của bạn.' },
  { icon: Monitor, title: 'Mở WebApp', text: 'Dùng ngay trên trình duyệt không cần cài đặt.' },
  { icon: Download, title: 'Tải Desktop nếu cần', text: 'Muốn học offline? Tải bản desktop cho máy tính.' },
];

// ===== BỘ LỌC =====
const levelFilters = [
  { label: 'T\u1EA5t c\u1EA3', code: 'all' },
  { label: 'Ti\u1EC3u h\u1ECDc', code: 'cap1' },
  { label: 'THCS / C\u1EA5p 2', code: 'cap2' },
  { label: 'THPT / C\u1EA5p 3', code: 'cap3' },
];

const supportPhone = '0902964685';
const supportZaloUrl = 'https://zalo.me/0902964685';
const desktopDownloadUrl = (import.meta as any).env?.VITE_DESKTOP_DOWNLOAD_URL || '';

type SupportTopic =
  | 'Chọn app học phù hợp'
  | 'Hỏi về Lớp 6'
  | 'Hướng dẫn đăng nhập'
  | 'Thanh toán'
  | 'Tải desktop'
  | 'Gặp nhân viên hỗ trợ';

const supportTopics: SupportTopic[] = [
  'Chọn app học phù hợp',
  'Hỏi về Lớp 6',
  'Hướng dẫn đăng nhập',
  'Thanh toán',
  'Tải desktop',
  'Gặp nhân viên hỗ trợ',
];

// ===== NEW COMPONENTS =====

const GradeSelectionModal = ({
  product,
  isOpen,
  onClose,
  onConfirm,
}: {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (grades: number[]) => void;
}) => {
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedGrades([]);
    }
  }, [isOpen]);

  if (!isOpen || !product || !product.requiresGradeSelection) return null;

  const toggleGrade = (gradeId: number) => {
    if (selectedGrades.includes(gradeId)) {
      setSelectedGrades(selectedGrades.filter((g) => g !== gradeId));
    } else if (selectedGrades.length < product.maxGrades) {
      setSelectedGrades([...selectedGrades, gradeId]);
    }
  };

  const canConfirm = selectedGrades.length === product.maxGrades;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#e0cda9] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-black text-[#302819]">Chọn {product.maxGrades} lớp</h3>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#eadcc4] bg-[#fbf7ef] text-[#302819] hover:bg-[#f1dfb5]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-[#736754]">{product.selectionPrompt}</p>

        <div className="mb-4 grid grid-cols-2 gap-2">
          {GRADE_OPTIONS.map((grade) => {
            const isSelected = selectedGrades.includes(grade.id);
            const canSelect = selectedGrades.length < product.maxGrades || isSelected;

            return (
              <button
                key={grade.id}
                onClick={() => canSelect && toggleGrade(grade.id)}
                disabled={!canSelect && !isSelected}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-[#302819] bg-[#302819] text-white'
                    : canSelect
                      ? 'border-[#eadcc4] bg-white hover:bg-[#fbf6ed]'
                      : 'cursor-not-allowed border-[#eee7dc] bg-[#fbf7ef] text-[#8a7c68]'
                }`}
              >
                <span className="text-xl">{grade.icon}</span>
                <span className="font-semibold">{grade.name}</span>
                {isSelected && <Check className="ml-auto h-4 w-4" />}
              </button>
            );
          })}
        </div>

        <div className="mb-4 rounded-lg bg-[#fbf7ef] p-3 text-sm">
          <p className="font-medium text-[#302819]">
            Đã chọn: {selectedGrades.length}/{product.maxGrades} lớp
          </p>
          <p className="mt-1 text-[#736754]">
            {selectedGrades.length > 0
              ? selectedGrades.map((id) => GRADE_OPTIONS.find((g) => g.id === id)?.name).join(', ')
              : 'Chưa chọn lớp nào'}
          </p>
        </div>

        <button
          onClick={() => canConfirm && onConfirm(selectedGrades)}
          disabled={!canConfirm}
          className={`w-full rounded-xl py-3 font-semibold transition-all ${
            canConfirm
              ? 'bg-[#302819] text-white hover:bg-[#4b3a22]'
              : 'cursor-not-allowed bg-[#eee7dc] text-[#8a7c68]'
          }`}
        >
          Xác nhận chọn {product.maxGrades} lớp
        </button>
      </div>
    </>
  );
};

const ProductCard = ({
  product,
  onPurchase,
}: {
  product: Product;
  onPurchase: (product: Product) => void;
}) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN').format(price);
  };

  return (
    <div className="rounded-3xl border border-[#e0cda9] bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h4 className="text-lg font-black text-[#302819]">{product.name}</h4>
          <p className="text-sm text-[#9b783e]">{product.targetAudience}</p>
        </div>
        {product.badge && (
          <span className="shrink-0 rounded-full bg-[#f1dfb5] px-3 py-1 text-xs font-bold text-[#74511e]">
            {product.badge}
          </span>
        )}
      </div>

      <p className="mb-4 text-sm text-[#736754]">{product.description}</p>

      <div className="mb-4 space-y-1">
        {product.originalPrice > product.price && (
          <p className="text-sm text-[#9b783e] line-through">
            {formatPrice(product.originalPrice)}đ
          </p>
        )}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-[#302819]">
            {formatPrice(product.price)}đ
          </span>
          <span className="text-sm text-[#9b783e]">/12 tháng</span>
        </div>
      </div>

      <ul className="mb-4 space-y-2 text-sm text-[#5f5342]">
        {product.features.slice(0, 4).map((feature, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6b8d35]" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onPurchase(product)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#302819] py-3 font-semibold text-white transition-all hover:bg-[#4b3a22] hover:-translate-y-0.5"
      >
        <ShoppingCart className="h-4 w-4" />
        Mua ngay
      </button>
    </div>
  );
};

const CheckoutWithQR = ({
  product,
  order,
  paymentInfo,
  selectedGrades,
  onBack,
  onHome,
}: {
  product: Product;
  order: Order;
  paymentInfo: PaymentInfo;
  selectedGrades: number[];
  onBack: () => void;
  onHome: () => void;
}) => {
  const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price);

  const [paidOrder, setPaidOrder] = useState<Order | null>(null);
  const [showPaidModal, setShowPaidModal] = useState(false);

  useEffect(() => {
    if (!order.orderId) return;

    let stopped = false;
    const POLL_INTERVAL = 5000;
    const MAX_DURATION = 10 * 60 * 1000; // 10 minutes
    const startTime = Date.now();

    const poll = async () => {
      if (stopped) return;
      if (Date.now() - startTime > MAX_DURATION) return;

      try {
        const res = await fetch(`${API_BASE_URL}/orders/${order.orderId}`);
        if (!res.ok) return; // tạm thời lỗi, bỏ qua
        const data = await res.json();
        if (data.ok && data.order?.status === 'paid') {
          stopped = true;
          setPaidOrder(data.order);
          setShowPaidModal(true);
          return;
        }
      } catch {
        // lỗi mạng tạm thời, tiếp tục chờ
      }

      if (!stopped) {
        timerId = window.setTimeout(poll, POLL_INTERVAL);
      }
    };

    let timerId = window.setTimeout(poll, POLL_INTERVAL);

    return () => {
      stopped = true;
      clearTimeout(timerId);
    };
  }, [order.orderId]);

  return (
    <>
      {/* ===== PAID SUCCESS MODAL ===== */}
      {showPaidModal && paidOrder && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden="true"
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#e0cda9] bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#d4edda] text-2xl">
                ✅
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#302819]">Thanh toán hoàn tất</h2>
                <p className="text-sm text-[#736754]">Cảm ơn bạn đã tin dùng dịch vụ</p>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-[#eadcc4] bg-[#fbf7ef] p-4 text-sm space-y-2">
              <p className="text-[#5f5342]">
                Chúng tôi đã ghi nhận thanh toán cho đơn hàng của bạn.
              </p>
              <div className="flex justify-between pt-1">
                <span className="text-[#736754]">Mã đơn hàng:</span>
                <span className="font-mono font-semibold text-[#302819]">{paidOrder.orderId}</span>
              </div>
              {product?.name && (
                <div className="flex justify-between">
                  <span className="text-[#736754]">Gói đã mua:</span>
                  <span className="font-medium text-[#302819]">{product.name}</span>
                </div>
              )}
              {paidOrder.licenseKey && (
                <div className="flex justify-between">
                  <span className="text-[#736754]">Mã kích hoạt:</span>
                  <span className="font-mono font-semibold text-[#302819]">{paidOrder.licenseKey}</span>
                </div>
              )}
              {paidOrder.dopiRechargeKeyMasked && (
                <div className="flex justify-between">
                  <span className="text-[#736754]">Dopi key:</span>
                  <span className="font-mono font-semibold text-[#302819]">{paidOrder.dopiRechargeKeyMasked}</span>
                </div>
              )}
              {paidOrder.dopiAmount ? (
                <div className="flex justify-between">
                  <span className="text-[#736754]">Số Dopi:</span>
                  <span className="font-semibold text-[#302819]">{paidOrder.dopiAmount.toLocaleString('vi-VN')} Dopi</span>
                </div>
              ) : null}
            </div>

            <p className="mb-5 text-xs text-[#736754] leading-5">
              {product.type === 'ai_credit'
                ? 'Dopi key sẽ gắn vào ví AI của tài khoản. Ai có key đều dùng được cho đến khi ví hết Dopi.'
                : 'Mã kích hoạt sẽ được xử lý theo hệ thống tài khoản. Nếu cần hỗ trợ, vui lòng liên hệ bộ phận hỗ trợ.'}
            </p>

            <div className="grid gap-2">
              <a
                href="https://app.hochungkhoi.site/cap-01/"
                className="flex items-center justify-center gap-2 rounded-xl bg-[#302819] py-3 text-sm font-semibold text-white transition-all hover:bg-[#4b3a22]"
              >
                Vào app học ngay
              </a>
              <button
                type="button"
                onClick={() => setShowPaidModal(false)}
                className="rounded-xl border border-[#302819] bg-white py-3 text-sm font-semibold text-[#302819] transition-all hover:bg-[#fbf6ed]"
              >
                Tôi đã hiểu
              </button>
            </div>
          </div>
        </>
      )}

      <section className="mx-auto max-w-[900px] rounded-xl border border-[#e6d7bd] bg-white/95 p-4 shadow-sm md:p-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#9b783e]">Thanh toán</p>
            <h2 className="text-2xl font-semibold text-[#302819]">Đơn hàng {order.orderId}</h2>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1">
            <span className="w-fit rounded-full bg-[#f1dfb5] px-3 py-1 text-sm font-medium text-[#74511e]">
              {order.status === 'pending' ? 'Chờ thanh toán' : 'Đã thanh toán'}
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-[#eadcc4] bg-[#fbf7ef] p-4">
              <h3 className="mb-3 font-semibold text-[#302819]">Thông tin đơn hàng</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#736754]">Sản phẩm:</span>
                  <span className="font-medium text-[#302819]">{product.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#736754]">Giá:</span>
                  <span className="font-medium text-[#302819]">{formatPrice(order.amount)}đ</span>
                </div>
                {selectedGrades.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#736754]">Lớp đã chọn:</span>
                    <span className="font-medium text-[#302819]">
                      {selectedGrades.map((id) => GRADE_OPTIONS.find((g) => g.id === id)?.name).join(', ')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#736754]">Mã đơn hàng:</span>
                  <span className="font-mono font-medium text-[#302819]">{order.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#736754]">Nội dung chuyển khoản:</span>
                  <span className="font-mono font-medium text-[#302819]">{paymentInfo.transferContent}</span>
                </div>
              </div>
              <p className="mt-3 rounded-lg bg-[#fff8e1] p-2 text-xs text-[#6b5227]">
                Đây là mã đơn hàng để đối soát thanh toán, không phải mã kích hoạt.
              </p>
            </div>

            <div className="rounded-xl border border-[#f0dca7] bg-[#fff8e1] p-4">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-[#6b5227]">
                <AlertCircle className="h-4 w-4" />
                Hướng dẫn thanh toán
              </h3>
              <div className="space-y-3 text-sm text-[#5f5342]">
                <p>
                  <strong>Bước 1:</strong> Mở app ngân hàng trên điện thoại
                </p>
                <p>
                  <strong>Bước 2:</strong> Chọn Quét mã QR hoặc chuyển khoản
                </p>
                <p>
                  <strong>Bước 3:</strong> Nhập nội dung chuyển khoản theo đơn hàng bên trên
                </p>
                <p>
                  <strong>Bước 4:</strong> Kiểm tra số tiền: <strong>{formatPrice(paymentInfo.amount)}đ</strong>
                </p>
                <p className="text-xs text-[#9b783e]">
                  * Hệ thống sẽ tự kiểm tra thanh toán sau mỗi vài giây.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onBack}
                className="flex-1 rounded-xl border border-[#302819] bg-white py-3 font-semibold text-[#302819] transition-all hover:bg-[#fbf6ed]"
              >
                Quay lại
              </button>
              <button
                onClick={onHome}
                className="flex-1 rounded-xl bg-[#302819] py-3 font-semibold text-white transition-all hover:bg-[#4b3a22]"
              >
                Về trang chủ
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-[#eadcc4] bg-white p-3">
              <h3 className="mb-3 text-center font-semibold text-[#302819]">Quét mã để thanh toán</h3>
              <div className="flex justify-center">
                <img
                  src={buildVietQRUrl(order.amount, paymentInfo.transferContent)}
                  alt="QR Code thanh toan"
                  className="h-[260px] w-[260px] rounded-lg border border-[#eadcc4] object-contain sm:h-[320px] sm:w-[320px] md:h-[380px] md:w-[380px]"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.src = asset(VIETQR_FALLBACK);
                    img.onerror = null; // Prevent infinite loop
                  }}
                />
                <div style={{ display: 'none' }} className="h-[260px] w-[260px] flex-col items-center justify-center rounded-lg border border-[#eadcc4] bg-[#fbf7ef] p-4 text-center text-sm text-[#5f5342]">
                  <p className="font-semibold text-[#302819]">Chuyển khoản ngân hàng</p>
                  <p className="mt-2">ACB</p>
                  <p className="mt-1 font-mono font-bold text-[#302819]">49312517</p>
                  <p className="mt-1">KHUONG VAN BINH</p>
                  <p className="mt-3 text-xs text-[#9b783e]">Nội dung: {paymentInfo.transferContent}</p>
                </div>
              </div>
              <div className="space-y-2 text-center text-sm">
                <p className="font-medium text-[#302819]">{paymentInfo.bank}</p>
                <p className="text-[#736754]">STK: <strong className="text-[#302819]">{paymentInfo.accountNumber}</strong></p>
                <p className="text-[#736754]">{paymentInfo.accountName}</p>
              </div>
            </div>

            <div className="rounded-xl border border-[#eadcc4] bg-[#fdf8f1] p-4">
              <h3 className="mb-2 font-semibold text-[#302819]">Cần hỗ trợ?</h3>
              <p className="mb-3 text-sm text-[#5f5342]">
                Liên hệ Zalo hoặc gọi điện để được hỗ trợ thanh toán
              </p>
              <div className="grid gap-2">
                <a
                  href="tel:0902964685"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#302819] py-2.5 text-sm font-semibold text-white hover:bg-[#4b3a22]"
                >
                  <Phone className="h-4 w-4" /> Gọi 0902964685
                </a>
                <a
                  href="https://zalo.me/0902964685"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#1d9bf0] py-2.5 text-sm font-semibold text-white hover:bg-[#187ed0]"
                >
                  <Send className="h-4 w-4" /> Nhắn Zalo
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

// ===== ORIGINAL COMPONENTS =====
const ProductModal = ({ product, isOpen, onClose, onPurchase }: { product: Product | null; isOpen: boolean; onClose: () => void; onPurchase: (product: Product) => void }) => {
  if (!isOpen || !product) return null;

  const hasPrice = product.price > 0;
  const showOriginalPrice = product.originalPrice > product.price;

  return (
    <>
      {/* Overlay - không onClick để đóng */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[#e0cda9] bg-white shadow-2xl sm:max-w-[600px]">
        {/* Header với nút close */}
        <div className="flex items-center justify-between border-b border-[#eadcc4] bg-white px-5 py-4">
          <h3 className="text-lg font-black text-[#302819]">{product.name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#eadcc4] bg-[#fbf7ef] text-[#302819] transition-all duration-200 hover:bg-[#f1dfb5] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(100vh-120px)] overflow-y-auto p-5 md:p-6">
          {/* Hình sản phẩm */}
          {product.image && (
            <img
              src={asset(product.image)}
              alt={product.name}
              className="mb-5 h-40 w-full rounded-2xl object-cover"
            />
          )}

          {/* Tên + Mô tả */}
          <div className="mb-4">
            <h4 className="text-xl font-black text-[#302819]">{product.name}</h4>
            <p className="mt-2 text-sm font-bold text-[#9b783e]">{product.level}</p>
            <p className="mt-2 text-sm leading-6 text-[#736754]">
              {product.shortDescription || product.description}
            </p>
          </div>

          {/* Mã KH */}
          <div className="mb-4 rounded-lg bg-[#fbf7ef] p-3">
            <p className="text-sm font-bold text-[#9b783e]">
              Mã KH: Sẽ tạo sau khi mua
            </p>
          </div>

          {/* Thông tin gói */}
          <div className="mb-4 rounded-2xl bg-[#f8f4e2] p-4 text-sm text-[#5f5342]">
            <p className="font-black">{product.description}</p>
            <ul className="mt-3 space-y-2 pl-5">
              {product.features.slice(0, 4).map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
          </div>

          {/* Trạng thái */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-bold text-[#9b783e]">Trạng thái:</span>
            <StatusBadge status={product.status || 'Sẵn sàng'} />
          </div>

          {/* Giá */}
          <div className="mb-5 rounded-2xl bg-[#fbf7ef] p-4">
            {hasPrice ? (
              <div className="space-y-2">
                {showOriginalPrice && (
                  <p className="text-sm font-bold text-[#9b783e]">
                    Giá gốc:{' '}
                    <span className="line-through">{product.originalPrice.toLocaleString('vi-VN')}đ</span>
                  </p>
                )}
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-black text-[#302819]">
                    {product.price.toLocaleString('vi-VN')}đ
                  </p>
                  <span className="text-sm font-bold text-[#9b783e]">/12 tháng</span>
                </div>
                {product.badge && (
                  <p className="text-xs font-bold text-[#6b8d35]">{product.badge}</p>
                )}
              </div>
            ) : (
              <p className="text-sm font-bold text-[#9b783e]">Giá đang cập nhật</p>
            )}
          </div>

          {/* Nút mua sản phẩm */}
          <button
            type="button"
            onClick={() => onPurchase(product)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#302819] px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#4b3a22] hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]"
          >
            <ShoppingCart className="h-4 w-4" />
            Mua sản phẩm
          </button>
        </div>
      </div>
    </>
  );
};

const AiPackagesModal = ({
  isOpen,
  onClose,
  onPurchase,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPurchase: (packageId: string) => void;
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-[980px] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-[#e0cda9] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#eadcc4] px-5 py-4 md:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9b783e]">Gói Dopi AI</p>
            <h3 className="text-xl font-black text-[#302819]">Xem chi tiết từng gói bên trong</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#eadcc4] bg-[#fbf7ef] text-[#302819] transition-all duration-200 hover:bg-[#f1dfb5] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(100vh-160px)] overflow-y-auto p-5 md:p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="rounded-[1.75rem] border border-[#eadcc4] bg-[#fffaf1] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#9b783e]">1 card ngoài</p>
                  <h4 className="text-2xl font-black text-[#302819]">Gói AI gọn, dễ nhìn</h4>
                </div>
                <span className="rounded-full bg-[#302819] px-3 py-1 text-xs font-bold text-white">Mở chi tiết</span>
              </div>

              <p className="max-w-2xl text-sm leading-7 text-[#736754]">
                Khi người dùng xem gói AI, chỉ cần nhìn một card tổng. Bấm vào là thấy từng gói con bên trong, rõ giá, rõ Dopi, không cần nhiều card ngoài làm rối mắt.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {AI_PACKAGE_PREVIEW.map((pkg) => (
                  <div key={pkg.id} className="rounded-3xl border border-[#e6d7bd] bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#9b783e]">{pkg.badge}</p>
                        <h5 className="mt-1 text-lg font-black text-[#302819]">{pkg.name}</h5>
                      </div>
                      <span className="rounded-full bg-[#fbf6ed] px-2 py-1 text-[11px] font-bold text-[#74511e]">
                        {pkg.dopi} Dopi
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#302819]">{pkg.price.toLocaleString('vi-VN')}đ</p>
                    <p className="mt-2 text-xs leading-5 text-[#736754]">{pkg.summary}</p>
                    <button
                      type="button"
                      onClick={() => onPurchase(pkg.id)}
                      className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[#302819] px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4b3a22] hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]"
                    >
                      Mua gói này
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-[#eadcc4] bg-[#fbf7ef] p-5">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-[#9b783e]">Bên trong gói</p>
              <div className="mt-4 space-y-3">
                {AI_PACKAGE_PREVIEW.map((pkg) => (
                  <div key={pkg.id} className="rounded-2xl border border-[#eadcc4] bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-base font-black text-[#302819]">{pkg.name}</div>
                        <div className="text-xs text-[#9b783e]">{pkg.priceNote}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-[#302819]">{pkg.price.toLocaleString('vi-VN')}đ</div>
                        <div className="text-xs font-bold text-[#8a6429]">{pkg.dopi} Dopi</div>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1.5 text-xs leading-5 text-[#736754]">
                      {pkg.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6b8d35]" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-dashed border-[#e0cda9] bg-white px-4 py-3 text-xs leading-5 text-[#736754]">
                Dopi là số hiển thị cho khách. Server vẫn trừ token thật ở backend và quy đổi theo mốc nội bộ.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const CheckoutPreview = ({
  product,
  orderCode,
  userEmail,
  onBack,
  onHome,
}: {
  product: Product;
  orderCode: string;
  userEmail: string | null;
  onBack: () => void;
  onHome: () => void;
}) => {
  const priceLabel = product.price > 0
    ? product.type === 'ai_credit'
      ? `${product.price.toLocaleString('vi-VN')}đ • ${product.credits || 0} Dopi`
      : `${product.price.toLocaleString('vi-VN')}đ / ${product.durationMonths} tháng`
    : 'Đang cập nhật';

  return (
    <section className="rounded-xl border border-[#e6d7bd] bg-white/95 p-4 shadow-sm md:p-5 max-w-[880px] mx-auto">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#9b783e]">Checkout preview</p>
          <h2 className="text-2xl font-semibold text-[#302819]">Thanh toán đơn hàng</h2>
        </div>
        <div className="rounded-2xl bg-[#fbf7ef] px-3 py-2 text-xs font-medium text-[#74511e]">
          Đơn tạm: <span className="font-semibold">{orderCode}</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="rounded-lg border border-[#eadcc4] bg-[#fbf7ef] p-3">
            <p className="text-xs font-medium text-[#9b783e]">Mã KH</p>
            <p className="mt-2 text-sm font-semibold text-[#302819]">Sẽ tạo sau khi mua</p>
          </div>

          <div className="grid gap-2 rounded-lg border border-[#eadcc4] bg-[#fffdf7] p-3">
            <div>
              <p className="text-xs font-medium text-[#9b783e]">Sản phẩm</p>
              <p className="mt-1 text-sm font-semibold text-[#302819]">{product.name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#9b783e]">Gói</p>
              {product.type === 'ai_credit' ? <p className="mt-1 text-sm font-semibold text-[#302819]">{product.credits} Dopi AI</p> : <p className="mt-1 text-sm font-semibold text-[#302819]">1 năm cho 1 lớp</p>}
            </div>
            <div>
              <p className="text-xs font-medium text-[#9b783e]">Email</p>
              <p className="mt-1 text-sm font-semibold text-[#302819]">
                {userEmail || 'Vui lòng đăng nhập để mua'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#9b783e]">Giá</p>
              <p className="mt-1 text-sm font-semibold text-[#302819]">{priceLabel}</p>
            </div>
          </div>

          <div className="rounded-lg border border-[#eadcc4] bg-[#fbf7ef] p-3">
            <label className="text-xs font-medium text-[#9b783e]" htmlFor="discountCode">
              Mã giảm giá
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="discountCode"
                type="text"
                placeholder="Nhập mã giảm giá"
                className="w-full rounded-lg border border-[#dad1bc] bg-white px-3 py-2 text-sm text-[#302819] shadow-sm focus:border-[#302819] focus:outline-none"
              />
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-[#302819] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4b3a22]"
              >
                Áp dụng mã
              </button>
            </div>
            <p className="mt-2 text-xs text-[#6b8d35]">Tính năng mã giảm giá sẽ mở sau</p>
          </div>

          <div className="rounded-lg border border-[#f0dca7] bg-[#fff8e1] p-3 text-sm text-[#6b5227]">
            <div className="font-medium">Thanh toán tự động đang được chuẩn bị.</div>
            <div className="mt-3 rounded-md border border-dashed border-[#f0dca7] p-3 flex items-center justify-center min-h-[120px]">
              <p className="text-xs text-[#5f5342]">Chừa chỗ cho QR, thông tin chuyển khoản, mã đơn và trạng thái thanh toán (sẽ hiển thị ở đây)</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-[#eadcc4] bg-[#fdf8f1] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[#9b783e]">Hỗ trợ</p>
            <p className="mt-2 text-sm leading-5 text-[#5f5342]">Nếu cần trợ giúp, bạn có thể gọi hoặc nhắn Zalo để được hỗ trợ mua hàng.</p>
            <div className="mt-3 space-y-2">
              <a
                href={`tel:${supportPhone}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#302819] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4b3a22]"
              >
                <Phone className="h-4 w-4" /> Gọi 0902964685
              </a>
              <a
                href={supportZaloUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1d9bf0] px-3 py-2 text-sm font-semibold text-white hover:bg-[#187ed0]"
              >
                <Send className="h-4 w-4" /> Nhắn Zalo
              </a>
            </div>
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex w-full items-center justify-center rounded-lg border border-[#302819] bg-white px-3 py-2 text-sm font-semibold text-[#302819] hover:bg-[#fbf6ed]"
            >
              Quay lại sản phẩm
            </button>
            <button
              type="button"
              onClick={onHome}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#302819] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4b3a22]"
            >
              Trang chủ
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    'Sẵn sàng': 'bg-[#6b8d35] text-white',
    'Sắp mở': 'bg-[#f1dfb5] text-[#74511e]',
    'Ý tưởng': 'bg-[#eee7dc] text-[#8a7c68]',
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${styles[status] || styles['Ý tưởng']}`}>
      {status}
    </span>
  );
};

const PriorityBadge = () => (
  <span className="rounded-full bg-[#302819] px-3 py-1 text-xs font-black text-white">
    Ưu tiên
  </span>
);

type HomePageProps = {
  clerkEnabled?: boolean;
};

// AuthSection: delegates to ClerkHeaderAuth (with ErrorBoundary) or fallback
function AuthSection({ 
  clerkEnabled, 
  onAccountFallback,
  onGoToAccount,
  isMobile = false,
  onMobileMenuClose
}: { 
  clerkEnabled: boolean; 
  onAccountFallback: () => void;
  onGoToAccount?: () => void;
  isMobile?: boolean;
  onMobileMenuClose?: () => void;
}) {
  if (!clerkEnabled) {
    const btnClass = isMobile 
      ? "inline-flex items-center gap-3 rounded-2xl border border-[#eadcc4] bg-white px-4 py-3 text-left text-sm font-bold shadow-sm hover:bg-[#fbf6ed]"
      : "inline-flex items-center gap-2 rounded-2xl border border-[#eadcc4] bg-white px-4 py-2 text-sm font-bold shadow-sm hover:bg-[#fbf6ed]";
    return (
      <button onClick={onAccountFallback} type="button" className={btnClass}>
        <UserRound className="h-4 w-4" /> Tài khoản
      </button>
    );
  }

  // Clerk mode - ClerkHeaderAuth has its own ErrorBoundary
  return (
    <ClerkHeaderAuth
      isMobile={isMobile}
      onMobileMenuClose={onMobileMenuClose}
      onFallback={onAccountFallback}
      onGoToAccount={onGoToAccount}
    />
  );
}

function useClerkUserSafe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useUser();
  } catch {
    return { user: null, isLoaded: true };
  }
}

export default function HomePage({ clerkEnabled = true }: HomePageProps) {
  const { user: clerkUser, isLoaded: clerkLoaded } = useClerkUserSafe();
  const { openSignIn } = useClerk();
  const [activeLevel, setActiveLevel] = useState<'all' | 'cap1' | 'cap2' | 'cap3'>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportTopic, setSupportTopic] = useState<SupportTopic>('Chọn app học phù hợp');
  const [supportMode, setSupportMode] = useState<'default' | 'ai'>('default');
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiChatScrollRef = useRef<HTMLDivElement | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAiPackagesOpen, setIsAiPackagesOpen] = useState(false);
  const [view, setView] = useState<'home' | 'checkout' | 'product-catalog' | 'account' | 'admin' | 'admin-licenses' | 'admin-customers' | 'admin-ai-credits' | 'admin-ai-settings'>('home');
  const [checkoutOrderCode, setCheckoutOrderCode] = useState('');

  const handleAiChat = async () => {
    if (!aiInput.trim()) return;

    const newMessages: ChatMessage[] = [...aiMessages, { role: 'user', content: aiInput }];
    setAiMessages(newMessages);
    setAiInput('');
    setIsAiLoading(true);
    requestAnimationFrame(() => {
      const el = aiChatScrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });

    try {
      const res = await fetch(`${API_BASE_URL}/web-support/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages.slice(-6),
          sessionId: getOrCreateSupportSessionId(),
          visitorEmail: clerkEnabled && clerkLoaded ? (clerkUser?.primaryEmailAddress?.emailAddress ?? null) : null,
          visitorName: clerkEnabled && clerkLoaded ? (clerkUser?.fullName || clerkUser?.firstName || null) : null,
          pageUrl: typeof window !== 'undefined' ? window.location.href : '',
          source: 'web-home',
        }),
      });

      if (!res.ok) {
        let errMessage = 'Hiện các nhân viên đang bận, vui lòng gọi lại sau.';
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch {
          // Keep fallback message when response is not JSON
        }
        throw new Error(errMessage);
      }

      const data = await res.json();
      const assistantMessage = data.response?.choices?.[0]?.message;

      if (assistantMessage) {
        setAiMessages(prev => [...prev, assistantMessage]);
        requestAnimationFrame(() => {
          const el = aiChatScrollRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
      } else {
        throw new Error('No response from AI assistant.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Hiện các nhân viên đang bận, vui lòng gọi lại sau.';
      setAiMessages(prev => [...prev, { role: 'system', content: message }]);
    } finally {
      setIsAiLoading(false);
      requestAnimationFrame(() => {
        const el = aiChatScrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      });
    }
  };


  // New state for product catalog flow
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<Product | null>(null);
  const [isGradeSelectionOpen, setIsGradeSelectionOpen] = useState(false);
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [currentPaymentInfo, setCurrentPaymentInfo] = useState<PaymentInfo | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutOrigin, setCheckoutOrigin] = useState<'product-modal' | 'catalog' | 'ai-packages' | null>(null);
  
  // userEmail: ưu tiên Clerk, fallback localStorage nếu không có Clerk
  const userEmail = clerkEnabled && clerkLoaded && clerkUser
    ? (clerkUser.primaryEmailAddress?.emailAddress ?? null)
    : (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null);

  const filteredAppCards = useMemo(() => {
    if (activeLevel === 'all') {
      return appCards;
    }

    return appCards.filter((app) => app.levelCode === activeLevel);
  }, [activeLevel]);

  const scrollToSection = (id: 'bo-loc-app' | 'danh-muc-app' | 'huong-dan-app') => {
    const section = document.getElementById(id);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleAccountFallback = () => {
    openSignIn();
  };

  const goToAccount = () => {
    setView('account');
    setMobileMenuOpen(false);
  };

  // Admin URL routing: legacy hash routes
  useEffect(() => {
    const checkAdminRoute = () => {
      const hash = window.location.hash;
      if (hash === '#/admin/licenses') {
        setView('admin-licenses');
      } else if (hash === '#/admin/customers') {
        setView('admin-customers');
      } else if (hash === '#/admin/ai-credits') {
        setView('admin-ai-credits');
      } else if (hash === '#/admin/ai-settings') {
        setView('admin-ai-settings');
      }
    };
    // Check on mount
    checkAdminRoute();
    // Listen for hash changes
    window.addEventListener('hashchange', checkAdminRoute);
    return () => window.removeEventListener('hashchange', checkAdminRoute);
  }, []);

  // Handle back from admin views (admin-licenses or admin-customers)
  const handleBackFromAdminLicenses = () => {
    window.location.hash = '#/admin/licenses';
    setView('home');
  };

  const handleBackFromAdminCustomers = () => {
    window.location.hash = '#/admin/customers';
    setView('home');
  };

  const handleBackFromAdminAiCredits = () => {
    window.location.hash = '#/admin/ai-credits';
    setView('home');
  };

  const handleBackFromAdminAiSettings = () => {
    window.location.hash = '#/admin/ai-settings';
    setView('home');
  };

  const handleMobileScroll = (id: 'danh-muc-app' | 'huong-dan-app') => {
    scrollToSection(id);
    setMobileMenuOpen(false);
  };

  const handleMobileAccountFallback = () => {
    openSignIn();
    setTimeout(() => setMobileMenuOpen(false), 0);
  };

  const handleMobileGoToAccount = () => {
    setView('account');
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    if (!supportOpen) {
      setSupportMode('default');
    }
  }, [supportOpen]);

  const handlePurchaseProduct = (product: Product) => {
    const orderCode = `HTT-${product.id}-${Math.floor(Date.now() / 1000)}`;
    setCheckoutOrderCode(orderCode);
    setCheckoutOrigin('product-modal');
    setIsProductModalOpen(false);
    setIsAiPackagesOpen(false);
    setView('checkout');
  };

  const createOrder = useCallback(async (product: Product, grades: number[]) => {
    setIsProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          customerEmail: userEmail,
          customerName: '',
          selectedGrades: grades,
        }),
      });

      const data = await response.json();
      
        if (data.ok) {
          setCurrentOrder(data.order);
          setCurrentPaymentInfo(data.paymentInfo);
          setSelectedGrades(grades);
          setCheckoutOrigin('catalog');
          setView('checkout');
        } else {
          alert(data.error || 'Không thể tạo đơn hàng');
        }
    } catch (error) {
      console.error('Order creation failed:', error);
      alert('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setIsProcessing(false);
    }
  }, [userEmail]);

  // New handlers for product catalog
  const handlePurchaseCatalogProduct = useCallback((product: Product) => {
    if (clerkEnabled && !clerkLoaded) {
      alert('Đang kiểm tra tài khoản, vui lòng chờ...');
      return;
    }
    if (!userEmail) {
      alert('Vui lòng đăng nhập để mua sản phẩm');
      return;
    }

    // Always set selectedCatalogProduct first so checkout render condition works
    setSelectedCatalogProduct(product);

    if (product.requiresGradeSelection) {
      setIsGradeSelectionOpen(true);
      setSelectedGrades([]);
    } else {
      // For non-bundle products, proceed directly
      createOrder(product, []);
    }
  }, [userEmail, createOrder]);

  const handleGradeConfirm = useCallback((grades: number[]) => {
    setIsGradeSelectionOpen(false);
    if (selectedCatalogProduct) {
      createOrder(selectedCatalogProduct, grades);
    }
  }, [selectedCatalogProduct, createOrder]);

  const handlePurchaseAiPackage = useCallback((packageId: string) => {
    if (clerkEnabled && !clerkLoaded) {
      alert('Đang kiểm tra tài khoản, vui lòng chờ...');
      return;
    }
    if (!userEmail) {
      alert('Vui lòng đăng nhập để mua sản phẩm');
      return;
    }

    const pkg = AI_PACKAGE_PREVIEW.find((item) => item.id === packageId);
      if (!pkg) {
        alert('Không tìm thấy gói AI cần mua');
        return;
      }

      setIsAiPackagesOpen(false);
      setIsProductModalOpen(false);

      const aiProduct: Product = {
        id: pkg.id,
        name: pkg.name,
      description: pkg.summary,
      price: pkg.price,
      originalPrice: pkg.price,
      currency: 'VND',
      billingCycle: 'yearly',
      durationMonths: 1,
      gradeIds: [],
      gradeNames: [],
      maxGrades: 0,
      features: pkg.features,
      targetAudience: 'Gói Dopi AI',
      isActive: true,
      sortOrder: 0,
      badge: pkg.badge,
        type: 'ai_credit',
        credits: pkg.dopi,
        shortDescription: pkg.priceNote,
      };

      setCheckoutOrigin('ai-packages');
      handlePurchaseCatalogProduct(aiProduct);
    }, [clerkEnabled, clerkLoaded, handlePurchaseCatalogProduct, userEmail]);

  const handleBackFromCheckout = useCallback(() => {
    setView(checkoutOrigin === 'ai-packages' ? 'home' : 'product-catalog');
    setCurrentOrder(null);
    setCurrentPaymentInfo(null);
    setSelectedCatalogProduct(null);
    setSelectedGrades([]);
    setCheckoutOrigin(null);
  }, [checkoutOrigin]);

  const handleHomeFromCheckout = useCallback(() => {
    setView('home');
    setCurrentOrder(null);
    setCurrentPaymentInfo(null);
    setSelectedCatalogProduct(null);
    setSelectedGrades([]);
    setIsProductModalOpen(false);
    setIsAiPackagesOpen(false);
    setSelectedProduct(null);
    setCheckoutOrigin(null);
  }, []);

  const handleCloseProductModal = () => {
    setIsProductModalOpen(false);
    setTimeout(() => setSelectedProduct(null), 300);
  };

  const renderSupportAnswer = () => {
    switch (supportTopic) {
      case 'Chọn app học phù hợp':
        return (
          <p>
            Anh/chị chọn theo cấp học và lớp của học sinh. Nếu đang học cấp 2, có thể bắt đầu từ app Lớp 6 đang sẵn sàng.
          </p>
        );
      case 'Hỏi về Lớp 6':
        return (
          <div className="space-y-3">
            <p>App Lớp 6 hiện đã có WebApp để học nhanh trên trình duyệt.</p>
            <a
              href="https://app.hochungkhoi.site/lop-06/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#302819] px-3 py-2 text-xs font-black text-white hover:bg-[#4b3a22]"
            >
              Mở app Lớp 6 <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        );
      case 'Hướng dẫn đăng nhập':
        return (
          <p>
            Bấm nút Tài khoản trên header, sau đó đăng nhập hoặc tạo tài khoản học tập.
          </p>
        );
      case 'Thanh toán':
        return (
          <p>
            Anh/chị liên hệ hỗ trợ để được tư vấn gói học và hướng dẫn thanh toán phù hợp.
          </p>
        );
      case 'Tải desktop':
        return (
          <div className="space-y-3">
            {desktopDownloadUrl ? (
              <a
                href={desktopDownloadUrl}
                className="inline-flex items-center gap-2 rounded-xl bg-[#302819] px-3 py-2 text-xs font-black text-white hover:bg-[#4b3a22]"
              >
                <Download className="h-4 w-4" /> Tải desktop
              </a>
            ) : (
              <>
                <p>Vào web lớp học và chọn mục Tải desktop nếu bản desktop đã được mở cho lớp đó.</p>
                <a
                  href="https://app.hochungkhoi.site/lop-06/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#302819] px-3 py-2 text-xs font-black text-white hover:bg-[#4b3a22]"
                >
                  Mở web Lớp 6 <ChevronRight className="h-4 w-4" />
                </a>
              </>
            )}
          </div>
        );
      case 'Gặp nhân viên hỗ trợ':
        return (
          <p>
            Anh/chị có thể dùng nút Gọi ngay hoặc Nhắn Zalo bên dưới để liên hệ nhân viên hỗ trợ.
          </p>
        );
      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f0e5] text-[#2d2518]">
      <section className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {/* ===== HEADER ===== */}
        <header className="sticky top-3 z-20 mb-4 flex items-center justify-between rounded-[1.5rem] border border-[#e6d7bd] bg-white/82 px-3 py-2 shadow-sm backdrop-blur md:px-6 md:py-3">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1dfb5] shadow-inner md:h-12 md:w-12">
              <GraduationCap className="h-5 w-5 text-[#74511e] md:h-7 md:w-7" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#9b783e] md:text-xs md:tracking-[0.22em]">Học tập thông minh</p>
              <h1 className="text-base font-black md:text-xl">Học Hứng Khởi</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#eadcc4] bg-white text-[#302819] shadow-sm hover:bg-[#fbf6ed] md:hidden"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <nav className="hidden items-center gap-2 md:flex">
            <button onClick={() => scrollToSection('danh-muc-app')} type="button" className="inline-flex items-center gap-2 rounded-2xl border border-[#eadcc4] bg-white px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-[#fbf6ed] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]">
              <Layers3 className="h-4 w-4" /> App học tập
            </button>
            <button onClick={() => scrollToSection('huong-dan-app')} type="button" className="inline-flex items-center gap-2 rounded-2xl border border-[#eadcc4] bg-white px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-[#fbf6ed] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]">
              <BookOpen className="h-4 w-4" /> Hướng dẫn
            </button>
            <AuthSection clerkEnabled={clerkEnabled} onAccountFallback={handleAccountFallback} onGoToAccount={goToAccount} />
            <button onClick={() => scrollToSection('danh-muc-app')} type="button" className="inline-flex items-center gap-2 rounded-2xl bg-[#302819] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#4b3a22] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]">
              <Sparkles className="h-4 w-4" /> Xem app
            </button>
          </nav>
          {mobileMenuOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] rounded-[1.25rem] border border-[#e6d7bd] bg-white/95 p-2 shadow-lg backdrop-blur md:hidden">
              <div className="grid gap-1.5">
                <button onClick={() => handleMobileScroll('danh-muc-app')} type="button" className="inline-flex items-center gap-2.5 rounded-xl border border-[#eadcc4] bg-white px-3 py-2.5 text-left text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-[#fbf6ed] active:scale-[0.98]">
                  <Layers3 className="h-4 w-4" /> App học tập
                </button>
                <button onClick={() => handleMobileScroll('huong-dan-app')} type="button" className="inline-flex items-center gap-2.5 rounded-xl border border-[#eadcc4] bg-white px-3 py-2.5 text-left text-sm font-semibold shadow-sm transition-all duration-200 hover:bg-[#fbf6ed] active:scale-[0.98]">
                  <BookOpen className="h-4 w-4" /> Hướng dẫn
                </button>
                <button onClick={() => handleMobileScroll('danh-muc-app')} type="button" className="inline-flex items-center gap-2.5 rounded-xl bg-[#302819] px-3 py-2.5 text-left text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#4b3a22] active:scale-[0.98]">
                  <Sparkles className="h-4 w-4" /> Xem app
                </button>
                <AuthSection 
                  clerkEnabled={clerkEnabled} 
                  onAccountFallback={handleMobileAccountFallback}
                  onGoToAccount={handleMobileGoToAccount}
                  isMobile={true}
                  onMobileMenuClose={() => setMobileMenuOpen(false)}
                />
              </div>
            </div>
          )}
        </header>

        {view === 'account' ? (
          <AccountPage onBack={() => setView('home')} />
        ) : view === 'admin-licenses' ? (
          <AdminLicensesPage onBack={handleBackFromAdminLicenses} />
        ) : view === 'admin-customers' ? (
          <AdminCustomersPage onBack={handleBackFromAdminCustomers} />
        ) : view === 'admin-ai-credits' ? (
          <AdminAiCreditsPage onBack={handleBackFromAdminAiCredits} />
        ) : view === 'admin-ai-settings' ? (
          <AdminAiSettingsPage onBack={handleBackFromAdminAiSettings} />
        ) : view === 'checkout' && currentOrder && currentPaymentInfo && selectedCatalogProduct ? (
          <CheckoutWithQR
            product={selectedCatalogProduct}
            order={currentOrder}
            paymentInfo={currentPaymentInfo}
            selectedGrades={selectedGrades}
            onBack={handleBackFromCheckout}
            onHome={handleHomeFromCheckout}
          />
        ) : view === 'checkout' && selectedProduct ? (
          <CheckoutPreview
            product={selectedProduct}
            orderCode={checkoutOrderCode}
            userEmail={userEmail}
            onBack={() => setView('home')}
            onHome={() => {
              setView('home');
              setSelectedProduct(null);
            }}
          />
        ) : view === 'product-catalog' ? (
          <section className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#9b783e]">Bảng giá</p>
                <h2 className="text-2xl font-black text-[#302819] md:text-3xl">Chọn gói học tập</h2>
              </div>
              <button
                onClick={() => setView('home')}
                className="rounded-xl border border-[#302819] bg-white px-4 py-2 text-sm font-semibold text-[#302819] hover:bg-[#fbf6ed]"
              >
                Quay lại
              </button>
            </div>
            
            {isProcessing && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-[#fff8e1] p-4 text-[#6b5227]">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Đang xử lý...</span>
              </div>
            )}
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PRODUCT_CATALOG.filter(p => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPurchase={handlePurchaseCatalogProduct}
                />
              ))}
            </div>
            
            <div className="mt-8 rounded-2xl border border-[#eadcc4] bg-[#fbf7ef] p-6 text-center">
              <p className="mb-2 text-lg font-semibold text-[#302819]">Cần tư vấn chọn gói?</p>
              <p className="mb-4 text-sm text-[#736754]">
                Liên hệ Zalo hoặc gọi điện để được hỗ trợ chọn gói phù hợp
              </p>
              <div className="flex justify-center gap-3">
                <a
                  href="tel:0902964685"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#302819] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4b3a22]"
                >
                  <Phone className="h-4 w-4" /> Gọi 0902964685
                </a>
                <a
                  href="https://zalo.me/0902964685"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1d9bf0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#187ed0]"
                >
                  <Send className="h-4 w-4" /> Nhắn Zalo
                </a>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* ===== HERO TRUNG TÂM ===== */}
            <section className="relative overflow-hidden rounded-[2.25rem] border border-[#e6d7bd] bg-[#fffaf1] p-5 shadow-sm md:p-8 lg:p-10">
          <img
            src={asset('images/home/hero-learning-hub.webp')}
            alt="Hero background learning hub"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#fffaf1]/84 via-[#fffaf1]/72 to-[#fffaf1]/84" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#f1dfb5]/70 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-[#d8e4c0]/70 blur-3xl" />

          <div className="relative z-10">
            <div className="relative">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#efe2c5] px-4 py-2 text-sm font-bold text-[#6f4c19]">
                <Sparkles className="h-4 w-4" /> Trung tâm giới thiệu các app học tập cho từng cấp, từng lớp
              </div>
              <h2 className="max-w-4xl text-4xl font-black leading-[1.04] tracking-tight md:text-6xl">
                <span className="animate-gradient-text bg-gradient-to-r from-[#6b4215] via-[#e6a51d] to-[#2f7d58] bg-clip-text text-transparent">
                  Công Cụ Học Tập Hỗ Trợ Cho Phụ Huynh & Học Sinh
                </span>
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#6d604d] md:text-lg">
                Chọn cấp học, chọn lớp, sau đó mở WebApp hoặc tải Desktop app phù hợp. 
                Mỗi lớp có trang riêng với đầy đủ môn học, bài giảng và luyện tập.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => scrollToSection('danh-muc-app')} type="button" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#302819] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4b3a22] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]">
                  <PlayCircle className="h-4 w-4" /> Xem app đang có
                </button>
                <button onClick={() => setView('product-catalog')} type="button" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#dcc8a3] bg-white px-5 py-3 text-sm font-semibold text-[#302819] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fbf6ed] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]">
                  <ShoppingCart className="h-4 w-4" /> Xem bảng giá
                </button>
              </div>
{/* HIGHLIGHTS */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                {highlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="rounded-3xl border border-[#d9c89d] bg-white/88 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#c0aa73]">
                      <Icon className="mb-2 h-5 w-5 text-[#8a6429]" />
                      <p className="text-sm font-semibold text-[#302819]">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#736754]">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ===== BỘ LỌC NHỎ ===== */}
        <section id="bo-loc-app" className="mt-6 rounded-[2rem] border border-[#e6d7bd] bg-white/78 p-4 shadow-sm md:p-6">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#9b783e]">Bộ lọc</p>
              <h3 className="text-xl font-black md:text-2xl">Chọn nhanh cấp học</h3>
            </div>
          </div>

          {/* CẤP HỌC */}
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {levelFilters.map((item) => (
                <button
                  type="button"
                  onClick={() => setActiveLevel(item.code as 'all' | 'cap1' | 'cap2' | 'cap3')}
                  key={item.code}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm transition-all duration-200 ${
                    activeLevel === item.code
                      ? 'border-[#302819] bg-[#302819] text-white'
                      : 'border-[#eadcc4] bg-white text-[#6d604d] hover:bg-[#fbf6ed] hover:-translate-y-0.5 hover:shadow-md'
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f] active:scale-[0.98]`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
</section>

        {/* ===== DANH MỤC APP HỌC TẬP ===== */}
        <section id="danh-muc-app" className="mt-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#9b783e]">Danh mục</p>
              <h3 className="text-2xl font-black md:text-3xl">Các app học tập</h3>
            </div>
            <button className="hidden rounded-2xl border border-[#eadcc4] bg-white px-4 py-2 text-sm font-bold shadow-sm md:block">
              Xem tất cả
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAppCards.map((app) => {
              const Icon = app.icon;
              const isLocked = app.status !== 'Sẵn sàng';
              return (
                <article
                  key={app.id}
                  className={`rounded-3xl border p-5 shadow-sm ${
                    isLocked ? 'border-[#eadcc4] bg-[#fbf7ef] opacity-75' : 'border-[#e0cda9] bg-white'
                  }`}
                >
                  {/* HEADER CARD */}
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-[#f1dfb5] p-3">
                      <Icon className="h-7 w-7 text-[#74511e]" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={app.status} />
                      {app.badge && <PriorityBadge />}
                    </div>
                  </div>

                  {/* IMAGE */}
                  {app.image && (
                    <img
                      src={asset(app.image)}
                      alt={app.name}
                      className="mb-4 h-44 w-full rounded-3xl object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  )}

                  {/* INFO */}
                  <h4 className="text-2xl font-black">{app.name}</h4>
                  <p className="mt-1 text-sm font-bold text-[#9b783e]">{app.level}</p>
                  <p className="mt-2 min-h-[48px] text-sm leading-6 text-[#736754]">{app.description}</p>

                  {/* SUBJECT TAGS */}
                  <div className="mt-4 flex flex-wrap gap-1">
                    {app.subjects.map((subject) => (
                      <span
                        key={subject}
                        className="rounded-lg bg-[#f1dfb5]/50 px-2 py-1 text-xs font-bold text-[#74511e]"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => app.link && window.open(app.link, '_blank', 'noopener,noreferrer')}
                      disabled={!app.hasWebApp || !app.link}
                      className={`inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200 ${
                        app.hasWebApp && app.link
                          ? 'bg-[#302819] text-white hover:bg-[#4b3a22] hover:-translate-y-0.5 hover:shadow-md'
                          : 'cursor-not-allowed bg-[#eee7dc] text-[#8a7c68]'
                      } ${app.hasWebApp && app.link ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f] active:scale-[0.98]' : ''}`}
                    >
                      <Globe className="h-4 w-4" /> {app.link ? 'WebApp' : 'Sắp mở'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cardProduct = app.productId ? PRODUCT_CATALOG.find((product) => product.id === app.productId) : null;
                        if (cardProduct) {
                          setCheckoutOrigin('catalog');
                          handlePurchaseCatalogProduct(cardProduct);
                          return;
                        }
                        setView('product-catalog');
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-xl border border-[#302819] bg-white px-3 py-2 text-sm font-semibold text-[#302819] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fbf6ed] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f] active:scale-[0.98]"
                    >
                      <ShoppingCart className="h-4 w-4" /> Mua sản phẩm
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ===== GÓI DOPI AI ===== */}
        <section className="mt-6 overflow-hidden rounded-[2rem] border border-[#e6d7bd] bg-[#2f281d] p-5 text-white shadow-sm md:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#f3d47c]">Gói Dopi AI</p>
              <h3 className="mt-2 text-2xl font-black md:text-3xl">1 card ngoài, gói chi tiết nằm bên trong</h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#decfb0]">
                Cách trình bày này giúp web chủ gọn hơn: người xem chỉ thấy một card chính, bấm vào thì mới mở ra các gói con bên trong.
                Dễ đọc, dễ bán và đỡ rối hơn việc bày quá nhiều card ngay mặt tiền.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setIsAiPackagesOpen(true)}
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#2f281d] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fff4d2] hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff2c4]"
                >
                  Xem chi tiết 3 gói
                </button>
                <button
                  type="button"
                  onClick={() => setView('admin-ai-credits')}
                  className="inline-flex items-center justify-center rounded-2xl border border-[#f3d47c]/40 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/15 hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d47c]"
                >
                  Mở trang quản lý gói
                </button>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-[#eadcc4]/30 bg-white/10 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#f3d47c]">Tóm tắt nhanh</p>
                  <h4 className="text-lg font-black text-white">3 gói bên trong</h4>
                </div>
                <span className="rounded-full bg-[#f3d47c] px-3 py-1 text-xs font-bold text-[#2f281d]">1 Dopi = 100đ</span>
              </div>
              <div className="mt-4 space-y-3">
                {AI_PACKAGE_PREVIEW.map((pkg) => (
                  <div key={pkg.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <div>
                      <div className="text-sm font-black text-white">{pkg.name}</div>
                      <div className="text-xs text-[#decfb0]">{pkg.summary}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">{pkg.price.toLocaleString('vi-VN')}đ</div>
                      <div className="text-xs text-[#f3d47c]">{pkg.dopi} Dopi</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== HƯỚNG DẪN SỬ DỤNG ===== */}
        <section id="huong-dan-app" className="mt-6 rounded-[2rem] border border-[#e6d7bd] bg-white/78 p-5 shadow-sm md:p-7">
          <div className="mb-6 text-center">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#9b783e]">Hướng dẫn</p>
            <h3 className="text-2xl font-black md:text-3xl">Cách sử dụng app học tập</h3>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {usageSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative rounded-3xl border border-[#eadcc4] bg-[#fbf7ef] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f1dfb5] text-sm font-semibold text-[#74511e]">
                      {index + 1}
                    </div>
                    <Icon className="h-5 w-5 text-[#8a6429]" />
                  </div>
                  <h4 className="text-base font-semibold text-[#302819]">{step.title}</h4>
                  <p className="mt-2 text-sm leading-5 text-[#736754]">{step.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ===== FEATURES - CÁCH HỆ APP HOẠT ĐỘNG ===== */}
        <section className="mt-6 rounded-[2rem] border border-[#e6d7bd] bg-white/78 p-5 shadow-sm md:p-7">
          <div className="mb-6 text-center">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#9b783e]">Cách hệ app hoạt động</p>
            <h3 className="text-2xl font-black md:text-3xl">Hệ sinh thái học tập</h3>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-[#eadcc4] bg-[#fbf7ef] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <img
                src={asset('images/home/feature-webapp.webp')}
                alt="WebApp dung nhanh"
                className="mb-3 h-32 w-full rounded-2xl object-cover"
                loading="lazy"
                decoding="async"
              />
              <h4 className="text-base font-semibold">WebApp dùng nhanh</h4>
              <p className="mt-2 text-sm leading-5 text-[#736754]">Không cần cài đặt, mở trình duyệt là học ngay.</p>
            </div>
            <div className="rounded-3xl border border-[#eadcc4] bg-[#fbf7ef] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <img
                src={asset('images/home/feature-desktop.webp')}
                alt="Desktop hoc offline"
                className="mb-3 h-32 w-full rounded-2xl object-cover"
                loading="lazy"
                decoding="async"
              />
              <h4 className="text-base font-semibold">Desktop học offline</h4>
              <p className="mt-2 text-sm leading-5 text-[#736754]">Tải bản desktop để học không cần mạng.</p>
            </div>
            <div className="rounded-3xl border border-[#eadcc4] bg-[#fbf7ef] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <img
                src={asset('images/home/feature-structured-data.webp')}
                alt="Du lieu co cau truc"
                className="mb-3 h-32 w-full rounded-2xl object-cover"
                loading="lazy"
                decoding="async"
              />
              <h4 className="text-base font-semibold">Dữ liệu có cấu trúc</h4>
              <p className="mt-2 text-sm leading-5 text-[#736754]">Bài học, luyện tập, tiến độ được tổ chức rõ ràng.</p>
            </div>
          </div>
        </section>

        {/* ===== CTA CUỐI TRANG ===== */}
        <section className="mt-7 overflow-hidden rounded-[2.25rem] border border-[#eadcc5] bg-[#2f281d] p-6 text-white shadow-[0_26px_90px_rgba(47,40,29,0.18)] md:p-8">
          <div className="grid gap-6 md:grid-cols-[1fr_360px] md:items-center">
            <div>
              <p className="mb-2 text-sm font-black uppercase tracking-[0.18em] text-[#f3d47c]">
                Hỗ trợ chọn app
              </p>
              <h3 className="text-2xl font-black md:text-3xl">
                Cần hỗ trợ chọn app học tập?
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#decfb0]">
                Gọi hoặc nhắn Zalo để được hướng dẫn chọn app phù hợp cho học sinh.
              </p>
              <p className="mt-3 text-xl font-black text-white">
                0902964685
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <a
                  href="tel:0902964685"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-[#2f281d] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fff4d2] hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff2c4]"
                >
                  Gọi ngay 0902964685
                </a>
                <a
                  href="https://zalo.me/0902964685"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl bg-[#1d9bf0] px-5 py-4 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#187ed0] hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]"
                >
                  Nhắn Zalo
                </a>
              </div>
            </div>

            <img
              src={asset('images/home/support-contact.webp')}
              alt="Ho tro chon app hoc tap"
              loading="lazy"
              decoding="async"
              className="h-64 w-full rounded-[2rem] object-cover shadow-lg md:h-72"
            />
          </div>
        </section>

        {/* ===== FOOTER ===== */}
        <footer className="mt-8 rounded-[2rem] border border-dashed border-[#d8c8a8] bg-white/60 p-5 text-center text-sm text-[#675b4a] md:p-6">
          <p className="font-black text-[#302819]">Học Tập Thông Minh — Trung tâm ứng dụng học tập cho từng cấp, từng lớp</p>
          <p className="mt-1">© 2025 Hệ sinh thái học tập. Chọn cấp học, chọn lớp, bắt đầu học.</p>
        </footer>
          </>
        )}
      </section>

      <ProductModal product={selectedProduct} isOpen={isProductModalOpen} onClose={handleCloseProductModal} onPurchase={handlePurchaseProduct} />

      <AiPackagesModal
        isOpen={isAiPackagesOpen}
        onClose={() => setIsAiPackagesOpen(false)}
        onPurchase={handlePurchaseAiPackage}
      />

      <GradeSelectionModal
        product={selectedCatalogProduct}
        isOpen={isGradeSelectionOpen}
        onClose={() => {
          setIsGradeSelectionOpen(false);
          setSelectedCatalogProduct(null);
        }}
        onConfirm={handleGradeConfirm}
      />

      {supportOpen ? (
        <aside className="fixed bottom-4 right-4 z-30 flex h-[min(78vh,680px)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[1.5rem] border border-[#e0cda9] bg-white shadow-[0_24px_80px_rgba(47,40,29,0.22)] transition-all duration-200">
          <div className="border-b border-[#eadcc4] bg-[#fffaf1] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#302819] text-white">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-[#302819]">Hỗ trợ nhanh</p>
                  <p className="text-xs font-bold text-[#7a6d58]">Chọn câu hỏi để nhận trả lời ngay</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSupportMode('default');
                  setSupportOpen(false);
                }}
                aria-label="Đóng hỗ trợ"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#eadcc4] bg-white text-[#302819] shadow-sm transition-all duration-200 hover:bg-[#fbf6ed] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-4 pb-3 flex flex-col">
            {supportMode === 'ai' ? (
              <div className="flex h-full min-h-0 flex-col">
                <div ref={aiChatScrollRef} className="flex-1 space-y-2 overflow-y-auto pr-2 mb-2 flex flex-col">
                  {aiMessages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`rounded-xl px-3 py-2 max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-[#302819] text-white' : 'bg-[#f0e8d8] text-[#1a1207]'}`}>
                        {msg.role === 'assistant' ? renderBotMessageContent(msg.content) : <span className="whitespace-pre-line">{msg.content}</span>}
                      </div>
                    </div>
                  ))}
                  {isAiLoading && <AiTypingBubble />}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-[#eadcc4] shrink-0">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAiChat()}
                    placeholder="Nhập câu hỏi..."
                    className="flex-1 rounded-lg border border-[#dad1bc] px-3 py-2 text-sm focus:border-[#302819] focus:outline-none shadow-sm"
                    disabled={isAiLoading}
                  />
                  <button onClick={handleAiChat} disabled={isAiLoading} className="rounded-lg bg-[#302819] px-3 py-2 text-white hover:bg-[#4b3a22] disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-[#eadcc4] bg-[#fbf7ef] p-3 text-sm leading-6 text-[#5f5342]">
                  {renderSupportAnswer()}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {supportTopics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => {
                        setSupportTopic(topic);
                        setSupportMode('default');
                      }}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all duration-200 ${
                        supportTopic === topic && supportMode === 'default'
                          ? 'border-[#302819] bg-[#302819] text-white shadow-sm'
                          : 'border-[#eadcc4] bg-white text-[#302819] hover:bg-[#fbf6ed] hover:-translate-y-0.5 hover:shadow-sm'
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f] active:scale-[0.98]`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-[#eadcc4] bg-white/96 p-3 backdrop-blur shrink-0">
            <a
              href={supportZaloUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d9bf0] px-3 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#187ed0] hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f]"
            >
              <Send className="h-4 w-4" /> Hỗ trợ Zalo
            </a>
            <button
              onClick={() => setSupportMode(supportMode === 'ai' ? 'default' : 'ai')}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9b17f] ${
                supportMode === 'ai'
                  ? 'bg-[#fbf7ef] text-[#302819] border border-[#eadcc4] hover:bg-[#f1dfb5]'
                  : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}>
              {supportMode === 'ai' ? (
                <><ArrowLeft className="h-4 w-4" /> Quay lại</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Chat</>
              )}
            </button>
          </div>
        
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSupportMode('default');
            setSupportOpen(true);
          }}
          className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-[#302819] px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-[#4b3a22] hover:shadow-xl active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff2c4] motion-safe:animate-pulse hover:animate-none"
          aria-label="Mở hỗ trợ"
        >
          <MessageCircle className="h-5 w-5" />
          Hỗ trợ
        </button>
      )}
    </main>
  );
}
