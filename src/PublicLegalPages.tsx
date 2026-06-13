import { useEffect } from 'react';
import { ArrowLeft, ChevronRight, Mail, ShieldCheck, Clock3, FileText, Home } from 'lucide-react';

type Section = {
  title: string;
  description?: string;
  items?: string[];
};

type PublicLegalPageProps = {
  title: string;
  eyebrow: string;
  intro: string;
  accent: string;
  sections: Section[];
  contactEmail: string;
  primaryCta: {
    label: string;
    href: string;
  };
  secondaryCtas?: Array<{
    label: string;
    href: string;
  }>;
  updatedNote?: string;
};

function LegalSectionCard({ section }: { section: Section }) {
  return (
    <article className="rounded-[1.75rem] border border-[#eadcc4] bg-white/90 p-5 shadow-sm md:p-6">
      <h2 className="text-lg font-black text-[#2f281d] md:text-xl">{section.title}</h2>
      {section.description ? (
        <p className="mt-3 text-sm leading-7 text-[#665948] md:text-[15px]">{section.description}</p>
      ) : null}
      {section.items?.length ? (
        <ul className="mt-4 space-y-3">
          {section.items.map((item) => (
            <li key={item} className="flex gap-3 text-sm leading-7 text-[#534737] md:text-[15px]">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#9b783e]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export default function PublicLegalPage({
  title,
  eyebrow,
  intro,
  accent,
  sections,
  contactEmail,
  primaryCta,
  secondaryCtas = [],
  updatedNote,
}: PublicLegalPageProps) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(241,223,181,0.45),_transparent_34%),linear-gradient(180deg,#fefaf2_0%,#f8f3e8_52%,#f3ede1_100%)] text-[#2f281d]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-[#eadcc4] bg-white/80 px-5 py-4 shadow-sm backdrop-blur md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <a href="/" className="inline-flex items-center gap-3 self-start">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#302819] text-sm font-black text-white shadow-sm">
                HCK
              </div>
              <div>
                <p className="text-sm font-black tracking-[0.16em] text-[#9b783e] uppercase">Học Chung Khối</p>
                <p className="text-sm text-[#675b4a]">Trang pháp lý công khai</p>
              </div>
            </a>

            <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <a
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-[#eadcc4] bg-white px-4 py-2 text-[#302819] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fbf6ed] hover:shadow-sm"
              >
                <Home className="h-4 w-4" />
                Trang chủ
              </a>
              <a
                href="/privacy-policy"
                className="inline-flex items-center gap-2 rounded-full border border-[#eadcc4] bg-white px-4 py-2 text-[#302819] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fbf6ed] hover:shadow-sm"
              >
                Chính sách riêng tư
              </a>
              <a
                href="/data-deletion"
                className="inline-flex items-center gap-2 rounded-full bg-[#302819] px-4 py-2 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4b3a22] hover:shadow-sm"
              >
                Xóa dữ liệu
                <ChevronRight className="h-4 w-4" />
              </a>
            </nav>
          </div>
        </header>

        <section className="relative mt-6 overflow-hidden rounded-[2.25rem] border border-[#eadcc5] bg-[#2f281d] px-6 py-8 text-white shadow-[0_26px_90px_rgba(47,40,29,0.16)] md:px-8 md:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(241,223,181,0.22),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(61,156,110,0.14),transparent_26%)]" />
          <div className="relative z-10 grid gap-8 md:grid-cols-[1.25fr_0.75fr] md:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#f1dfb5] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#6f4c19]">
                <ShieldCheck className="h-4 w-4" />
                {eyebrow}
              </div>
              <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">{title}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[#e8dcc5] md:text-[15px] md:leading-8">
                {intro}
              </p>
              {updatedNote ? (
                <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-[#f6edd7]">
                  <Clock3 className="h-4 w-4" />
                  {updatedNote}
                </p>
              ) : null}
            </div>

            <aside className="rounded-[1.75rem] border border-white/10 bg-white/10 p-5 backdrop-blur-sm md:p-6">
              <div className={`rounded-2xl bg-gradient-to-br ${accent} p-4 text-white shadow-sm`}>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white/80">Liên hệ</p>
                <p className="mt-2 break-all text-lg font-black">{contactEmail}</p>
                <a
                  href={`mailto:${contactEmail}`}
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-[#2f281d] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fff4d2] hover:shadow-sm"
                >
                  <Mail className="h-4 w-4" />
                  Gửi email
                </a>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-1">
                <a
                  href={primaryCta.href}
                  className="inline-flex items-center justify-between gap-3 rounded-2xl border border-[#eadcc4] bg-white px-4 py-3 text-sm font-semibold text-[#302819] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fbf6ed] hover:shadow-sm"
                >
                  <span>{primaryCta.label}</span>
                  <ArrowLeft className="h-4 w-4 rotate-180" />
                </a>
                {secondaryCtas.map((cta) => (
                  <a
                    key={cta.href}
                    href={cta.href}
                    className="inline-flex items-center justify-between gap-3 rounded-2xl border border-[#eadcc4] bg-white px-4 py-3 text-sm font-semibold text-[#302819] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fbf6ed] hover:shadow-sm"
                  >
                    <span>{cta.label}</span>
                    <ChevronRight className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <LegalSectionCard key={section.title} section={section} />
          ))}
        </section>

        <section className="mt-6 rounded-[2rem] border border-[#eadcc4] bg-white/85 p-5 shadow-sm md:p-6">
          <div className="grid gap-4 md:grid-cols-[1.3fr_0.7fr] md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#f1dfb5] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#6f4c19]">
                <FileText className="h-4 w-4" />
                Liên kết nhanh
              </div>
              <p className="mt-3 text-sm leading-7 text-[#665948] md:text-[15px]">
                Trang này là công khai, không cần đăng nhập, không gọi API và không dùng popup. Nếu bạn cần thay đổi hoặc xóa dữ liệu,
                hãy dùng đúng quy trình được nêu ở trên.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
              <a
                href={primaryCta.href}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#302819] px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4b3a22] hover:shadow-sm"
              >
                {primaryCta.label}
              </a>
              <a
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#eadcc4] bg-white px-5 py-3 text-sm font-semibold text-[#302819] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fbf6ed] hover:shadow-sm"
              >
                <Home className="h-4 w-4" />
                Về trang chủ
              </a>
            </div>
          </div>
        </section>

        <footer className="mt-6 mb-2 rounded-[2rem] border border-dashed border-[#d8c8a8] bg-white/60 px-5 py-4 text-center text-sm text-[#675b4a] md:px-6 md:py-5">
          <p className="font-black text-[#302819]">Học Chung Khối</p>
          <p className="mt-1">
            Public legal pages for Meta App review and user support.
          </p>
        </footer>
      </div>
    </main>
  );
}

export function PrivacyPolicyPage() {
  return (
    <PublicLegalPage
      title="Chính sách quyền riêng tư - Học Chung Khối"
      eyebrow="Privacy policy / Public page"
      intro="Website/app Học Chung Khối được dùng để tư vấn học tập, quản lý tài khoản, xử lý thanh toán, kích hoạt gói học và hỗ trợ khách hàng. Trang này mô tả cách chúng tôi có thể xử lý dữ liệu của bạn trong các tình huống đó."
      accent="from-[#2f281d] via-[#44513a] to-[#0f5b46]"
      contactEmail="support@hochungkhoi.site"
      primaryCta={{
        label: 'Yêu cầu xóa dữ liệu',
        href: '/data-deletion',
      }}
      secondaryCtas={[
        {
          label: 'Về trang chủ',
          href: '/',
        },
      ]}
      updatedNote="Trang này áp dụng cho website và ứng dụng Học Chung Khối."
      sections={[
        {
          title: 'Phạm vi áp dụng',
          description:
            'Chính sách này áp dụng cho các trải nghiệm công khai trên website/app Học Chung Khối, bao gồm phần tư vấn học tập, tài khoản, thanh toán, kích hoạt gói học và hỗ trợ khách hàng.',
        },
        {
          title: 'Các loại dữ liệu có thể được xử lý',
          items: [
            'Thông tin tài khoản đăng nhập nếu người dùng đăng nhập vào hệ thống.',
            'Email hoặc số điện thoại nếu người dùng tự cung cấp để được hỗ trợ.',
            'Nội dung tin nhắn khi người dùng chat với fanpage hoặc chatbot.',
            'Thông tin giao dịch, đơn hàng hoặc kích hoạt gói học nếu có mua dịch vụ.',
            'Dữ liệu kỹ thuật cơ bản như trình duyệt, thời gian truy cập và lỗi hệ thống.',
          ],
        },
        {
          title: 'Mục đích sử dụng dữ liệu',
          items: [
            'Hỗ trợ học tập và tư vấn gói học phù hợp.',
            'Xử lý thanh toán, kích hoạt tài khoản hoặc gói học.',
            'Chăm sóc khách hàng và phản hồi các yêu cầu hỗ trợ.',
            'Cải thiện chất lượng dịch vụ, trải nghiệm và độ ổn định của hệ thống.',
            'Thực hiện các nghĩa vụ vận hành cần thiết để cung cấp dịch vụ đã đăng ký.',
          ],
        },
        {
          title: 'Cam kết bảo vệ dữ liệu',
          items: [
            'Chúng tôi không bán dữ liệu cá nhân của người dùng cho bên thứ ba.',
            'Chúng tôi không công khai nội dung chat cá nhân của người dùng.',
            'Chỉ chia sẻ dữ liệu khi cần thiết để vận hành dịch vụ hoặc khi có yêu cầu hợp pháp từ cơ quan có thẩm quyền.',
          ],
        },
        {
          title: 'Yêu cầu xóa dữ liệu',
          description:
            'Nếu bạn muốn xóa dữ liệu liên quan đến tài khoản, chat hoặc lịch sử hỗ trợ, hãy xem trang hướng dẫn xóa dữ liệu công khai của chúng tôi để gửi yêu cầu đúng cách.',
        },
        {
          title: 'Liên hệ',
          description:
            'Nếu bạn có thắc mắc về chính sách quyền riêng tư hoặc muốn kiểm tra dữ liệu đang được xử lý, vui lòng liên hệ qua email hỗ trợ bên dưới.',
        },
      ]}
    />
  );
}

export function DataDeletionPage() {
  return (
    <PublicLegalPage
      title="Hướng dẫn yêu cầu xóa dữ liệu - Học Hứng Khởi"
      eyebrow="Data deletion / Public page"
      intro="Người dùng có thể yêu cầu xóa dữ liệu liên quan đến tài khoản, chatbot hoặc Facebook Messenger. Trang này mô tả hai cách gửi yêu cầu công khai và những thông tin nên cung cấp để chúng tôi xử lý nhanh hơn."
      accent="from-[#302819] via-[#5a3d20] to-[#8b5a1f]"
      contactEmail="support@hochungkhoi.site"
      primaryCta={{
        label: 'Xem chính sách quyền riêng tư',
        href: '/privacy-policy',
      }}
      secondaryCtas={[
        {
          label: 'Về trang chủ',
          href: '/',
        },
      ]}
      updatedNote="Yêu cầu được xử lý trong thời gian hợp lý theo quy trình nội bộ."
      sections={[
        {
          title: 'Hai cách gửi yêu cầu xóa dữ liệu',
          items: [
            'Gửi email tới support@hochungkhoi.site với tiêu đề: “Yêu cầu xóa dữ liệu Học Chung Khối”.',
            'Nhắn tin trực tiếp fanpage Học Chung Khối với nội dung: “Tôi muốn xóa dữ liệu của tôi”.',
          ],
        },
        {
          title: 'Thông tin nên cung cấp',
          items: [
            'Email hoặc số điện thoại đã dùng nếu có.',
            'Tên Facebook hoặc thông tin nhận diện cuộc trò chuyện.',
            'Mô tả dữ liệu bạn muốn xóa hoặc phạm vi bạn muốn áp dụng.',
          ],
        },
        {
          title: 'Thời gian xử lý',
          description:
            'Chúng tôi sẽ cố gắng xử lý yêu cầu trong thời gian hợp lý, thường trong khoảng 7-30 ngày làm việc tùy mức độ phức tạp của dữ liệu và trạng thái xác minh.',
        },
        {
          title: 'Lưu ý về dữ liệu bắt buộc phải giữ',
          description:
            'Một số dữ liệu giao dịch hoặc chứng từ liên quan có thể phải được lưu lại theo nghĩa vụ kế toán, thuế hoặc pháp lý nếu có. Khi đó, chúng tôi chỉ giữ phần dữ liệu cần thiết và không dùng cho mục đích khác ngoài nghĩa vụ bắt buộc.',
        },
        {
          title: 'Kênh liên hệ bổ sung',
          description:
            'Nếu bạn cần đối chiếu thêm thông tin trước khi xóa, hãy dùng email hỗ trợ hoặc quay lại trang chính sách quyền riêng tư để xem chi tiết phạm vi dữ liệu được xử lý.',
        },
        {
          title: 'Trang liên quan',
          description:
            'Bạn có thể quay về trang chủ hoặc xem lại chính sách quyền riêng tư bất kỳ lúc nào từ các liên kết ở cuối trang.',
        },
      ]}
    />
  );
}
