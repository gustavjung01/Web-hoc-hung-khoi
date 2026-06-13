import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser, useAuth, useClerk } from '@clerk/clerk-react';
import { ArrowLeft, Save, AlertCircle, CheckCircle, Server, Key, Globe, MessageCircle, Send, Loader2, Bell, Clock3, Trash2, CheckSquare } from 'lucide-react';

interface AIProvider {
  name: string;
  baseUrl?: string;
  authToken?: string;
  apiKey?: string;
  model: string;
  enabled: boolean;
  projectId?: string;
  location?: string;
  credentialsJson?: string;
  servingConfigId?: string;
  languageCode?: string;
}

interface AIProvidersConfig {
  activeProvider: string;
  providers: Record<string, AIProvider>;
  pricing: AIPricingConfig;
}

interface AIPricingTaskConfig {
  inputPer1k: number;
  outputPer1k: number;
  multiplier: number;
}

interface AIPricingConfig {
  enabled: boolean;
  dopiValueVnd: number;
  tasks: Record<'chat' | 'explain_lesson' | 'generate_practice' | 'deep_search', AIPricingTaskConfig>;
}

interface AIModelOption {
  value: string;
  label: string;
  description?: string;
}

interface WebSupportTelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  notifyOnNewChat: boolean;
  notifyOnLead: boolean;
  notifyOnEveryMessage?: boolean;
}

interface WebSupportPricingTaskConfig {
  inputPer1k: number;
  outputPer1k: number;
  multiplier: number;
}

interface WebSupportPricingConfig {
  enabled: boolean;
  tasks: Record<'chat' | 'explain_lesson' | 'deep_search' | 'summarize', WebSupportPricingTaskConfig>;
}

interface WebSupportConfig {
  enabled: boolean;
  providerType: 'gemini' | 'openai_compatible' | 'vertex_gemini' | 'dialogflow_cx' | 'google_agent_search';
  baseUrl: string;
  projectId: string;
  location: string;
  apiKey: string;
  authToken: string;
  credentialsJson: string;
  model: string;
  languageCode?: string;
  servingConfigId?: string;
  systemPrompt: string;
  telegram: WebSupportTelegramConfig;
  pricing: WebSupportPricingConfig;
}

const DEFAULT_AI_PRICING_CONFIG: AIPricingConfig = {
  enabled: true,
  dopiValueVnd: 100,
  tasks: {
    chat: { inputPer1k: 1.0, outputPer1k: 1.0, multiplier: 1.0 },
    explain_lesson: { inputPer1k: 1.25, outputPer1k: 1.45, multiplier: 1.15 },
    generate_practice: { inputPer1k: 1.3, outputPer1k: 1.6, multiplier: 1.2 },
    deep_search: { inputPer1k: 1.6, outputPer1k: 2.1, multiplier: 1.8 },
  },
};

interface WebSupportLogEntry {
  id: string;
  createdAt: string;
  sessionId?: string | null;
  source?: string;
  pageUrl?: string | null;
  visitorName?: string | null;
  visitorEmail?: string | null;
  userMessage?: string;
  assistantMessage?: string | null;
  detectedPhones?: string[];
  detectedEmails?: string[];
  isLead?: boolean;
  telegramStatus?: string | null;
  telegramError?: string | null;
  error?: string | null;
}

const DEFAULT_WEB_SUPPORT_CONFIG: WebSupportConfig = {
  enabled: true,
  providerType: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  projectId: '',
  location: 'global',
  apiKey: '',
  authToken: '',
  credentialsJson: '',
  model: 'gemini-2.0-flash',
  languageCode: 'vi',
  servingConfigId: 'default_serving_config',
  systemPrompt: `Bạn là nhân viên hỗ trợ chính thức của Học Hứng Khởi.
 Luôn trả lời thân thiện, ngắn gọn, rõ ràng, đúng trọng tâm.
 Không tự xưng Claude, Gemini, OpenAI hay bất kỳ model nào.
 Nếu người dùng hỏi về gói học, kích hoạt, thanh toán, đăng nhập, hãy hướng dẫn chính xác.
 Nếu người dùng để lại số điện thoại hoặc email, hãy ghi nhận lịch sử và báo rằng bộ phận hỗ trợ sẽ liên hệ lại.
 Nếu câu hỏi ngoài phạm vi, hãy trả lời lịch sự và hướng người dùng liên hệ hỗ trợ.`,
  telegram: {
    enabled: false,
    botToken: '',
    chatId: '',
    notifyOnNewChat: true,
    notifyOnLead: true,
    notifyOnEveryMessage: false,
  },
  pricing: {
    enabled: false,
    tasks: {
      chat: { inputPer1k: 1.0, outputPer1k: 1.0, multiplier: 1.0 },
      explain_lesson: { inputPer1k: 1.2, outputPer1k: 1.4, multiplier: 1.15 },
      deep_search: { inputPer1k: 1.5, outputPer1k: 2.0, multiplier: 1.8 },
      summarize: { inputPer1k: 0.9, outputPer1k: 1.1, multiplier: 1.05 },
    }
  }
};

const API_BASE = '';

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude (AI Prime Tech)',
  gemini: 'Google Gemini (Direct)',
  vertex: 'Google Vertex AI',
  dialogflow_cx: 'Google Chat / Dopi Gia Su',
  google_agent_search: 'Google Search / Sales Bot',
};

const WEB_SUPPORT_PRICING_TASKS: Array<{
  key: keyof WebSupportPricingConfig['tasks'];
  label: string;
  description: string;
}> = [
  { key: 'chat', label: 'Chat thường', description: 'Hỏi đáp ngắn, chi phí thấp nhất.' },
  { key: 'explain_lesson', label: 'Giải thích bài', description: 'Có ngữ cảnh bài học đang mở.' },
  { key: 'deep_search', label: 'Search chuyên sâu', description: 'Tra cứu nhiều nguồn, tốn token hơn.' },
  { key: 'summarize', label: 'Tóm tắt', description: 'Tóm gọn nội dung, mức trung bình.' },
];

const AI_PRICING_TASKS: Array<{
  key: keyof AIPricingConfig['tasks'];
  label: string;
  description: string;
}> = [
  { key: 'chat', label: 'Chat thường', description: 'Hội thoại ngắn, chi phí thấp nhất.' },
  { key: 'explain_lesson', label: 'Giải thích bài', description: 'Có ngữ cảnh bài học cụ thể.' },
  { key: 'generate_practice', label: 'Tạo luyện tập', description: 'Sinh câu hỏi/bài luyện tập.' },
  { key: 'deep_search', label: 'Search chuyên sâu', description: 'Tra cứu nhiều nguồn, tốn token hơn.' },
];

function mergeWebSupportPricing(
  base: WebSupportPricingConfig,
  next?: Partial<WebSupportPricingConfig> | null,
): WebSupportPricingConfig {
  const nextTasks = (next?.tasks || {}) as Partial<WebSupportPricingConfig['tasks']>;
  return {
    enabled: next?.enabled ?? base.enabled,
    tasks: {
      ...base.tasks,
      chat: {
        ...base.tasks.chat,
        ...(nextTasks.chat || {}),
      },
      explain_lesson: {
        ...base.tasks.explain_lesson,
        ...(nextTasks.explain_lesson || {}),
      },
      deep_search: {
        ...base.tasks.deep_search,
        ...(nextTasks.deep_search || {}),
      },
      summarize: {
        ...base.tasks.summarize,
        ...(nextTasks.summarize || {}),
      },
    },
  };
}

function mergeAiPricing(
  base: AIPricingConfig,
  next?: Partial<AIPricingConfig> | null,
): AIPricingConfig {
  const nextTasks = (next?.tasks || {}) as Partial<AIPricingConfig['tasks']>;
  return {
    enabled: next?.enabled ?? base.enabled,
    dopiValueVnd: next?.dopiValueVnd ?? base.dopiValueVnd,
    tasks: {
      ...base.tasks,
      chat: {
        ...base.tasks.chat,
        ...(nextTasks.chat || {}),
      },
      explain_lesson: {
        ...base.tasks.explain_lesson,
        ...(nextTasks.explain_lesson || {}),
      },
      generate_practice: {
        ...base.tasks.generate_practice,
        ...(nextTasks.generate_practice || {}),
      },
      deep_search: {
        ...base.tasks.deep_search,
        ...(nextTasks.deep_search || {}),
      },
    },
  };
}

function isGoogleAgentSearchProviderKey(providerKey: string) {
  return providerKey === 'google_agent_search';
}

function isDialogflowCxProviderKey(providerKey: string) {
  return providerKey === 'dialogflow_cx';
}

function isGoogleSalesProviderKey(providerKey: string) {
  return isGoogleAgentSearchProviderKey(providerKey) || isDialogflowCxProviderKey(providerKey);
}

function getMainProviderDisplayName(providerKey: string, provider?: AIProvider) {
  return provider?.name || PROVIDER_LABELS[providerKey] || providerKey;
}

function getMainProviderModelSummary(providerKey: string, provider?: AIProvider) {
  const model = String(provider?.model || '').trim();
  if (!model) {
    return 'Chưa nhập ID';
  }
  if (providerKey === 'google_agent_search') {
    return `Engine / App ID: ${model}`;
  }
  if (providerKey === 'dialogflow_cx') {
    return `Agent ID: ${model}`;
  }
  return model;
}

const AVAILABLE_MODELS: Record<string, AIModelOption[]> = {
  claude: [
    { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1', description: 'Mạnh nhất' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', description: 'Mạnh, cân bằng' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'Cân bằng' },
    { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', description: 'Ổn định, mạnh' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet v2', description: 'Cân bằng tốt' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', description: 'Nhanh, rẻ' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Mạnh nhất' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Nhanh, đa năng' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', description: 'Rẻ nhất' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'Context dài' },
  ],
  vertex: [
    { value: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash', description: 'Nhanh nhất' },
    { value: 'gemini-2.0-pro-001', label: 'Gemini 2.0 Pro', description: 'Mạnh nhất' },
    { value: 'gemini-1.5-flash-001', label: 'Gemini 1.5 Flash', description: 'Cân bằng' },
    { value: 'gemini-1.5-pro-001', label: 'Gemini 1.5 Pro', description: 'Context dài' },
  ],
};

const VERTEX_LOCATION_OPTIONS: AIModelOption[] = [
  { value: 'global', label: 'global', description: 'Mặc định / đa vùng' },
  { value: 'us-central1', label: 'us-central1', description: 'Mỹ - Trung tâm' },
  { value: 'us-east4', label: 'us-east4', description: 'Mỹ - East 4' },
  { value: 'europe-west1', label: 'europe-west1', description: 'Châu Âu - West 1' },
  { value: 'asia-east1', label: 'asia-east1', description: 'Châu Á - East 1' },
];

function getVertexLocationOptions(currentValue?: string): AIModelOption[] {
  const value = String(currentValue || '').trim();
  if (!value) return VERTEX_LOCATION_OPTIONS;
  if (VERTEX_LOCATION_OPTIONS.some((option) => option.value === value)) {
    return VERTEX_LOCATION_OPTIONS;
  }
  return [
    { value, label: `${value} (Current)` },
    ...VERTEX_LOCATION_OPTIONS,
  ];
}

function isValidServiceAccountJson(rawJson: string): boolean {
  const raw = String(rawJson || '').trim();
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === 'object' && parsed.client_email && parsed.private_key);
  } catch {
    return false;
  }
}

function AdminAiSettingsPage({ onBack }: { onBack: () => void }) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { openSignIn } = useClerk();

  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [config, setConfig] = useState<AIProvidersConfig>({
    activeProvider: 'claude',
    providers: {
      claude: {
        name: 'Claude (AI Prime Tech)',
        baseUrl: '',
        authToken: '',
        model: 'claude-sonnet-4-20250514',
        enabled: true
      },
      gemini: {
        name: 'Google Gemini (Direct)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: '',
        model: 'gemini-2.0-flash',
        enabled: false
      },
      vertex: {
        name: 'Google Vertex AI',
        projectId: '',
        location: 'us-central1',
        model: 'gemini-2.0-flash-001',
        enabled: false
      },
      dialogflow_cx: {
        name: 'Google Chat / Dopi Gia Su',
        baseUrl: 'https://dialogflow.googleapis.com/v3',
        projectId: 'web-hochungkhoi-chatbot',
        location: 'global',
        credentialsJson: '',
        model: '79129181-d156-4071-8bde-e8088f849e91',
        languageCode: 'vi',
        enabled: false
      },
      google_agent_search: {
        name: 'Google Search / Sales Bot',
        baseUrl: 'https://discoveryengine.googleapis.com/v1',
        projectId: 'web-hochungkhoi-chatbot',
        location: 'global',
        credentialsJson: '',
        model: 'hoc-chung-khoi-tu-van_1780386592569',
        servingConfigId: 'default_serving_config',
        enabled: false
      }
    },
    pricing: DEFAULT_AI_PRICING_CONFIG,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [remoteModels, setRemoteModels] = useState<Record<string, AIModelOption[]>>({});
  const [showAiPricingPanel, setShowAiPricingPanel] = useState(false);
  const [webSupportConfig, setWebSupportConfig] = useState<WebSupportConfig>(DEFAULT_WEB_SUPPORT_CONFIG);
  const [webSupportRemoteModels, setWebSupportRemoteModels] = useState<AIModelOption[]>([]);
  const [webSupportLogs, setWebSupportLogs] = useState<WebSupportLogEntry[]>([]);
  const [selectedWebSupportLogIds, setSelectedWebSupportLogIds] = useState<string[]>([]);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [loadingWebSupportModels, setLoadingWebSupportModels] = useState(false);
  const [savingSupport, setSavingSupport] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [deletingWebSupportLogs, setDeletingWebSupportLogs] = useState(false);
  const [showPricingPanel, setShowPricingPanel] = useState(false);
  const vertexCredentialsInputRef = useRef<HTMLInputElement | null>(null);
  const webSupportGeminiCredentialsInputRef = useRef<HTMLInputElement | null>(null);
  const webSupportAgentCredentialsInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!user) {
      setAuthChecked(true);
      setIsAdmin(false);
      return;
    }

    setAuthChecked(true);
    setIsAdmin(true);
  }, [isLoaded, user]);

  const loadWebSupportData = useCallback(async () => {
    setLoadingSupport(true);
    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [settingsRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/web-support-settings`, { headers }),
        fetch(`${API_BASE}/api/admin/web-support-logs?limit=12`, { headers }),
      ]);

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.ok && settingsData.config) {
          const nextConfig = {
            ...DEFAULT_WEB_SUPPORT_CONFIG,
            ...settingsData.config,
            telegram: {
              ...DEFAULT_WEB_SUPPORT_CONFIG.telegram,
              ...(settingsData.config.telegram || {}),
              notifyOnNewChat: settingsData.config.telegram?.notifyOnNewChat ?? DEFAULT_WEB_SUPPORT_CONFIG.telegram.notifyOnNewChat,
              notifyOnLead: settingsData.config.telegram?.notifyOnLead ?? DEFAULT_WEB_SUPPORT_CONFIG.telegram.notifyOnLead,
              notifyOnEveryMessage: false,
            },
            pricing: mergeWebSupportPricing(
              DEFAULT_WEB_SUPPORT_CONFIG.pricing,
              settingsData.config.pricing || undefined
            )
          } as WebSupportConfig;

          if (nextConfig.providerType === 'vertex_gemini') {
            nextConfig.baseUrl = nextConfig.baseUrl || 'https://aiplatform.googleapis.com/v1';
            nextConfig.location = nextConfig.location || 'us-central1';
          } else if (nextConfig.providerType === 'dialogflow_cx') {
            nextConfig.baseUrl = nextConfig.baseUrl || 'https://dialogflow.googleapis.com/v3';
            nextConfig.location = nextConfig.location || 'global';
            nextConfig.languageCode = nextConfig.languageCode || 'vi';
          } else if (nextConfig.providerType === 'google_agent_search') {
            nextConfig.baseUrl = nextConfig.baseUrl || 'https://discoveryengine.googleapis.com/v1';
            nextConfig.location = nextConfig.location || 'global';
            nextConfig.servingConfigId = nextConfig.servingConfigId || 'default_serving_config';
          } else if (nextConfig.providerType === 'gemini') {
            nextConfig.baseUrl = nextConfig.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
          }

          setWebSupportConfig(nextConfig);
        }
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setWebSupportLogs(Array.isArray(logsData.logs) ? logsData.logs : []);
        setSelectedWebSupportLogIds([]);
      }
    } catch {
      // Keep the page usable even if support data fails to load.
    } finally {
      setLoadingSupport(false);
    }
  }, [getToken]);

  const selectedWebSupportLogSet = new Set(selectedWebSupportLogIds);
  const allWebSupportLogsSelected = webSupportLogs.length > 0 && webSupportLogs.every((log) => selectedWebSupportLogSet.has(log.id));

  const toggleAllWebSupportLogs = () => {
    if (allWebSupportLogsSelected) {
      setSelectedWebSupportLogIds([]);
      return;
    }
    setSelectedWebSupportLogIds(webSupportLogs.map((log) => log.id));
  };

  const handleDeleteSelectedWebSupportLogs = async () => {
    if (!selectedWebSupportLogIds.length) return;
    const confirmed = window.confirm(`Xóa ${selectedWebSupportLogIds.length} log đã chọn?`);
    if (!confirmed) return;

    setDeletingWebSupportLogs(true);
    setError('');
    setSuccess('');

    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/admin/web-support-logs`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ ids: selectedWebSupportLogIds }),
      });

      const data = await res.json();
      if (data.ok) {
      setSuccess(`Đã xóa ${data.deleted || selectedWebSupportLogIds.length} log.`);
      await loadWebSupportData();
      setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to delete selected logs');
      }
    } catch {
      setError('Network error');
    } finally {
      setDeletingWebSupportLogs(false);
    }
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/admin/ai-settings`, { headers });

      if (res.status === 401 || res.status === 403) {
        setError('Không có quyền admin');
        setIsAdmin(false);
        return;
      }

      const data = await res.json();
      if (data.ok) {
        setConfig(prev => ({
          activeProvider: data.activeProvider || 'claude',
          providers: { ...prev.providers, ...data.providers },
          pricing: mergeAiPricing(DEFAULT_AI_PRICING_CONFIG, data.pricing || undefined),
        }));
        setIsAdmin(true);
        await loadWebSupportData();
      } else {
        setError(data.error || 'Failed to load AI settings');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [getToken, loadWebSupportData]);

  useEffect(() => {
    if (isAdmin) fetchConfig();
  }, [isAdmin, fetchConfig]);

  const updateProvider = (providerKey: string, field: keyof AIProvider, value: string | boolean) => {
    setConfig(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerKey]: {
          ...prev.providers[providerKey],
          [field]: value
        }
      }
    }));
  };

  const importCredentialsJsonFromFile = async (
    file: File,
    onSuccess: (jsonText: string, parsed?: any) => void,
  ) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      onSuccess(JSON.stringify(parsed, null, 2));
      setError('');
      setSuccess(`Đã nạp file ${file.name}`);
      setTimeout(() => setSuccess(''), 2500);
    } catch {
      setError('File JSON không hợp lệ. Hãy chọn file service account .json đúng định dạng.');
    }
  };

  const updateAiPricingTask = (
    taskKey: keyof AIPricingConfig['tasks'],
    field: keyof AIPricingTaskConfig,
    value: number,
  ) => {
    setConfig(prev => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        tasks: {
          ...prev.pricing.tasks,
          [taskKey]: {
            ...prev.pricing.tasks[taskKey],
            [field]: Number.isFinite(value) ? value : 0,
          },
        },
      },
    }));
  };

  const updateWebSupportConfig = (field: keyof WebSupportConfig, value: WebSupportConfig[keyof WebSupportConfig]) => {
    setWebSupportConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateWebSupportTelegram = (field: keyof WebSupportTelegramConfig, value: string | boolean) => {
    setWebSupportConfig(prev => ({
      ...prev,
      telegram: {
        ...prev.telegram,
        [field]: value
      }
    }));
  };

  const updateWebSupportPricingTask = (
    taskKey: keyof WebSupportPricingConfig['tasks'],
    field: keyof WebSupportPricingTaskConfig,
    value: number,
  ) => {
    setWebSupportConfig(prev => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        tasks: {
          ...prev.pricing.tasks,
          [taskKey]: {
            ...prev.pricing.tasks[taskKey],
            [field]: Number.isFinite(value) ? value : 0,
          },
        },
      },
    }));
  };

  const handleVertexCredentialsFileChange = async (
    e: any,
    onSuccess: (jsonText: string, parsed?: any) => void,
  ) => {
    const file = e?.target?.files?.[0];
    if (e?.target) {
      e.target.value = '';
    }
    if (!file) return;
    await importCredentialsJsonFromFile(file, onSuccess);
  };

  const handleWebSupportProviderTypeChange = (providerType: WebSupportConfig['providerType']) => {
    setWebSupportConfig(prev => {
      const normalizedProviderType = providerType;
      const next: WebSupportConfig = {
        ...prev,
        providerType: normalizedProviderType,
      };

      if (normalizedProviderType === 'gemini') {
        next.baseUrl = prev.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
        next.credentialsJson = '';
      } else if (normalizedProviderType === 'vertex_gemini') {
        next.baseUrl = 'https://aiplatform.googleapis.com/v1';
        next.location = 'us-central1';
        next.apiKey = '';
        next.authToken = '';
      } else if (normalizedProviderType === 'dialogflow_cx') {
        next.baseUrl = 'https://dialogflow.googleapis.com/v3';
        next.location = 'global';
        next.languageCode = prev.languageCode || 'vi';
        next.apiKey = '';
        next.authToken = '';
      } else if (normalizedProviderType === 'google_agent_search') {
        next.baseUrl = 'https://discoveryengine.googleapis.com/v1';
        next.location = 'global';
        next.servingConfigId = prev.servingConfigId || 'default_serving_config';
        next.apiKey = '';
        next.authToken = '';
      }

      return next;
    });
  };

  const effectiveWebSupportModelOptions = webSupportConfig.model && !webSupportRemoteModels.some(model => model.value === webSupportConfig.model)
    ? [{ value: webSupportConfig.model, label: `${webSupportConfig.model} (Current)` }, ...webSupportRemoteModels]
    : webSupportRemoteModels;

  const loadWebSupportModels = async () => {
    setLoadingWebSupportModels(true);
    setError('');

    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/admin/web-support-settings/models`, {
        method: 'POST',
        headers,
      body: JSON.stringify({
        providerType: webSupportConfig.providerType,
        baseUrl: webSupportConfig.baseUrl || '',
        authToken: webSupportConfig.authToken || '',
        apiKey: webSupportConfig.apiKey || '',
        credentialsJson: webSupportConfig.credentialsJson || '',
        projectId: webSupportConfig.projectId || '',
        location: webSupportConfig.location || '',
        languageCode: webSupportConfig.languageCode || '',
        servingConfigId: webSupportConfig.servingConfigId || '',
      }),
    });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to load support models');
        return;
      }

      const models: AIModelOption[] = Array.isArray(data.models) ? data.models.filter(Boolean) : [];
      setWebSupportRemoteModels(models);

      if (models.length > 0 && !models.some(model => model.value === webSupportConfig.model)) {
        setWebSupportConfig(prev => ({
          ...prev,
          model: models[0].value,
        }));
      }
    } catch {
      setError('Network error');
    } finally {
      setLoadingWebSupportModels(false);
    }
  };

  const activeProvider = config.providers[config.activeProvider];
  const baseModelOptions = remoteModels[config.activeProvider]?.length
    ? remoteModels[config.activeProvider]
    : AVAILABLE_MODELS[config.activeProvider] || [];

  const effectiveModelOptions = activeProvider?.model && !baseModelOptions.some(m => m.value === activeProvider.model)
    ? [{ value: activeProvider.model, label: `${activeProvider.model} (Current)` }, ...baseModelOptions]
    : baseModelOptions;

  const isGoogleSalesProvider = isGoogleSalesProviderKey(config.activeProvider);
  const isGoogleAgentSearchProvider = isGoogleAgentSearchProviderKey(config.activeProvider);
  const isDialogflowCxProvider = isDialogflowCxProviderKey(config.activeProvider);

  const resetActiveProviderModel = () => {
    const defaultModel = AVAILABLE_MODELS[config.activeProvider]?.[0]?.value
      || (isGoogleSalesProvider ? activeProvider?.model || '' : '');

    setConfig(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [config.activeProvider]: {
          ...prev.providers[config.activeProvider],
          model: defaultModel
        }
      }
    }));
  };

  const loadProviderModels = async () => {
    setLoadingModels(true);
    setError('');

    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/admin/ai-settings/models`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          providerKey: config.activeProvider,
          baseUrl: activeProvider?.baseUrl || '',
          authToken: activeProvider?.authToken || '',
          apiKey: activeProvider?.apiKey || '',
          credentialsJson: activeProvider?.credentialsJson || '',
          projectId: activeProvider?.projectId || '',
          location: activeProvider?.location || '',
          servingConfigId: activeProvider?.servingConfigId || '',
        })
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to load models');
        return;
      }

      const models: AIModelOption[] = Array.isArray(data.models) ? data.models.filter(Boolean) : [];
      setRemoteModels(prev => ({
        ...prev,
        [config.activeProvider]: models
      }));

      if (isGoogleSalesProvider) {
        setSuccess(models[0]?.value
          ? `Đã kiểm tra ${activeProvider?.name || 'Google provider'}: ${models[0].value}`
          : `Đã kiểm tra ${activeProvider?.name || 'Google provider'}.`);
        setTimeout(() => setSuccess(''), 4000);
      } else if (models.length > 0 && !models.some(model => model.value === activeProvider?.model)) {
        updateProvider(config.activeProvider, 'model', models[0].value);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const normalizedProviders = {
        ...config.providers,
        [config.activeProvider]: {
          ...config.providers[config.activeProvider],
          enabled: true
        }
      };
      if (config.activeProvider === 'google_agent_search') {
        normalizedProviders[config.activeProvider] = {
          ...normalizedProviders[config.activeProvider],
          baseUrl: String(normalizedProviders[config.activeProvider]?.baseUrl || '').trim() || 'https://discoveryengine.googleapis.com/v1',
          projectId: String(normalizedProviders[config.activeProvider]?.projectId || '').trim(),
          location: String(normalizedProviders[config.activeProvider]?.location || '').trim() || 'global',
          servingConfigId: String(normalizedProviders[config.activeProvider]?.servingConfigId || '').trim() || 'default_serving_config',
        };
      }
      if (config.activeProvider === 'dialogflow_cx') {
        normalizedProviders[config.activeProvider] = {
          ...normalizedProviders[config.activeProvider],
          baseUrl: String(normalizedProviders[config.activeProvider]?.baseUrl || '').trim() || 'https://dialogflow.googleapis.com/v3',
          projectId: String(normalizedProviders[config.activeProvider]?.projectId || '').trim(),
          location: String(normalizedProviders[config.activeProvider]?.location || '').trim() || 'global',
          languageCode: String(normalizedProviders[config.activeProvider]?.languageCode || '').trim() || 'vi',
        };
      }
      if ((config.activeProvider === 'vertex' || config.activeProvider === 'google_agent_search' || config.activeProvider === 'dialogflow_cx') && !isValidServiceAccountJson(normalizedProviders[config.activeProvider]?.credentialsJson || '')) {
        setError('Service Account JSON không hợp lệ hoặc thiếu client_email/private_key.');
        return;
      }
      if (config.activeProvider === 'google_agent_search') {
        normalizedProviders[config.activeProvider] = {
          ...normalizedProviders[config.activeProvider],
          servingConfigId: String(normalizedProviders[config.activeProvider]?.servingConfigId || '').trim() || 'default_serving_config',
        };
      }

      const normalizedPricing = mergeAiPricing(DEFAULT_AI_PRICING_CONFIG, config.pricing || undefined);

      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/admin/ai-settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          activeProvider: config.activeProvider,
          providers: normalizedProviders,
          pricing: normalizedPricing,
        })
      });

      const data = await res.json();
      if (data.ok) {
        setConfig(prev => ({
          ...prev,
          providers: normalizedProviders,
          pricing: mergeAiPricing(DEFAULT_AI_PRICING_CONFIG, data.pricing || normalizedPricing),
        }));
        setSuccess('Đã lưu cấu hình thành công!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWebSupport = async () => {
    setSavingSupport(true);
    setError('');
    setSuccess('');

    try {
      if (
        (webSupportConfig.providerType === 'vertex_gemini' || webSupportConfig.providerType === 'dialogflow_cx' || webSupportConfig.providerType === 'google_agent_search') &&
        !isValidServiceAccountJson(webSupportConfig.credentialsJson)
      ) {
        setError('Google Cloud Credentials JSON không hợp lệ hoặc thiếu client_email/private_key.');
        return;
      }

      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/admin/web-support-settings`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(webSupportConfig),
      });

      const data = await res.json();
      if (data.ok) {
        setWebSupportConfig({
          ...DEFAULT_WEB_SUPPORT_CONFIG,
          ...data.config,
          telegram: {
            ...DEFAULT_WEB_SUPPORT_CONFIG.telegram,
            ...(data.config?.telegram || {}),
            notifyOnNewChat: data.config?.telegram?.notifyOnNewChat ?? DEFAULT_WEB_SUPPORT_CONFIG.telegram.notifyOnNewChat,
            notifyOnLead: data.config?.telegram?.notifyOnLead ?? DEFAULT_WEB_SUPPORT_CONFIG.telegram.notifyOnLead,
            notifyOnEveryMessage: false,
          },
          pricing: mergeWebSupportPricing(
            DEFAULT_WEB_SUPPORT_CONFIG.pricing,
            data.config?.pricing || undefined
          )
        });
      setSuccess('Đã lưu cấu hình Web Support thành công!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to save web support settings');
      }
    } catch {
      setError('Network error');
    } finally {
      setSavingSupport(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setError('');
    setSuccess('');

    try {
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/admin/web-support-settings/test-telegram`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: 'Test từ Học Hứng Khởi: Telegram đang hoạt động.',
          telegram: webSupportConfig.telegram,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setSuccess('Telegram test đã gửi thành công!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to test Telegram');
      }
    } catch {
      setError('Network error');
    } finally {
      setTestingTelegram(false);
    }
  };

  if (!isLoaded || !authChecked) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="inline-block animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
            <p className="text-gray-500">Đang kiểm tra đăng nhập...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1 text-center">Đăng nhập Admin</h2>
          <p className="text-sm text-gray-500 mb-4 text-center">Vui lòng đăng nhập để truy cập trang quản trị</p>
          <button
            onClick={() => openSignIn()}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Đăng nhập với Clerk
          </button>
          <button
            onClick={onBack}
            className="w-full mt-3 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
          >
            <ArrowLeft className="inline h-4 w-4 mr-2" />
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="bg-white rounded-xl shadow border border-gray-200 p-6 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 text-2xl mb-4">
            ?
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Không có quyền truy cập</h2>
          <p className="text-sm text-gray-500 mb-4">{error || 'Tài khoản không có quyền truy cập.'}</p>
          <button
            onClick={onBack}
            className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
          >
            <ArrowLeft className="inline h-4 w-4 mr-2" />
            Về trang chủ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 sm:mb-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Về trang chủ
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 mb-1 sm:text-2xl">Cấu hình AI bán ra</h1>
            <p className="text-gray-500 text-sm leading-5">
              Nhánh này dùng cho AI app bán ra. Web Support Bot nội bộ được cấu hình ở khối bên dưới.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left sm:text-right">
            <p className="text-xs text-gray-500">Đăng nhập với</p>
            <p className="max-w-full break-all text-sm font-medium text-gray-900">{user.primaryEmailAddress?.emailAddress}</p>
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:mb-6 sm:flex sm:flex-wrap">
        <button
          onClick={() => window.location.hash = '#/admin/customers'}
          className="min-h-10 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-200"
        >
          Khách hàng
        </button>
        <button
          onClick={() => window.location.hash = '#/admin/licenses'}
          className="min-h-10 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-200"
        >
          License Keys
        </button>
        <button
          onClick={() => window.location.hash = '#/admin/ai-credits'}
          className="min-h-10 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-200"
        >
          Gói Dopi AI
        </button>
        <button
          onClick={() => window.location.hash = '#/admin/ai-settings'}
          className="min-h-10 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
        >
          AI bán ra
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="ml-auto text-green-500 hover:text-green-700">×</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
          <p className="text-gray-500">Đang tải cấu hình...</p>
        </div>
      ) : (
        <>
        <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-600" />
                Chọn AI chính
              </h2>

              <div className="space-y-3">
                {Object.entries(config.providers).map(([key, provider]) => (
                  <label
                    key={key}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                      config.activeProvider === key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="activeProvider"
                      value={key}
                      checked={config.activeProvider === key}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        activeProvider: e.target.value,
                        providers: {
                          ...prev.providers,
                          [e.target.value]: {
                            ...prev.providers[e.target.value],
                            enabled: true
                          }
                        }
                      }))}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-medium text-gray-900">{getMainProviderDisplayName(key, provider)}</div>
                      <div
                        className="mt-1 break-all text-xs text-gray-500"
                        title={provider.model || ''}
                      >
                        {getMainProviderModelSummary(key, provider)}
                      </div>
                      {config.activeProvider === key && (
                        <span className="inline-block mt-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded">
                          Đang kích hoạt
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow border border-gray-200 p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Key className="h-5 w-5 text-blue-600" />
                Cấu hình {getMainProviderDisplayName(config.activeProvider, activeProvider)}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isDialogflowCxProvider ? 'Agent ID' : (isGoogleAgentSearchProvider ? 'Engine / App ID' : 'Model AI')}
                  </label>
                  {isGoogleSalesProvider ? (
                    <div className="space-y-4">
                      {isDialogflowCxProvider ? (
                        <>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                              <input
                                type="text"
                                value={activeProvider?.baseUrl || 'https://dialogflow.googleapis.com/v3'}
                                onChange={(e) => updateProvider(config.activeProvider, 'baseUrl', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                                placeholder="https://dialogflow.googleapis.com/v3"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Project ID</label>
                              <input
                                type="text"
                                value={activeProvider?.projectId || ''}
                                onChange={(e) => updateProvider(config.activeProvider, 'projectId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                                placeholder="web-hochungkhoi-chatbot"
                              />
                            </div>
                          </div>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                              <input
                                type="text"
                                value={activeProvider?.location || 'global'}
                                onChange={(e) => updateProvider(config.activeProvider, 'location', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                                placeholder="global"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Language Code</label>
                              <input
                                type="text"
                                value={activeProvider?.languageCode || 'vi'}
                                onChange={(e) => updateProvider(config.activeProvider, 'languageCode', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                                placeholder="vi"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Agent ID</label>
                            <input
                              type="text"
                              value={activeProvider?.model || ''}
                              onChange={(e) => updateProvider(config.activeProvider, 'model', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                              placeholder="79129181-d156-4071-8bde-e8088f849e91"
                            />
                            <p className="text-xs text-gray-500 mt-1">Dùng Agent ID trong Dialogflow CX, không dùng tên hiển thị.</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                              <input
                                type="text"
                                value={activeProvider?.baseUrl || 'https://discoveryengine.googleapis.com/v1'}
                                onChange={(e) => updateProvider(config.activeProvider, 'baseUrl', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                                placeholder="https://discoveryengine.googleapis.com/v1"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Project ID</label>
                              <input
                                type="text"
                                value={activeProvider?.projectId || ''}
                                onChange={(e) => updateProvider(config.activeProvider, 'projectId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                                placeholder="web-hochungkhoi-chatbot"
                              />
                            </div>
                          </div>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                              <input
                                type="text"
                                value={activeProvider?.location || 'global'}
                                onChange={(e) => updateProvider(config.activeProvider, 'location', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                                placeholder="global"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Serving Config ID</label>
                              <input
                                type="text"
                                value={activeProvider?.servingConfigId || 'default_serving_config'}
                                onChange={(e) => updateProvider(config.activeProvider, 'servingConfigId', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                                placeholder="default_serving_config"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Engine / App ID</label>
                            <input
                              type="text"
                              value={activeProvider?.model || ''}
                              onChange={(e) => updateProvider(config.activeProvider, 'model', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                              placeholder="hoc-chung-khoi-tu-van_1780386592569"
                            />
                            <p className="text-xs text-gray-500 mt-1">Dùng App/Engine ID trong AI Applications, không dùng Data Store ID.</p>
                          </div>
                        </>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Google Cloud Credentials JSON</label>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => vertexCredentialsInputRef.current?.click()}
                            className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                          >
                            Chọn file JSON
                          </button>
                          <input
                            ref={vertexCredentialsInputRef}
                            type="file"
                            accept=".json,application/json"
                            className="hidden"
                            onChange={(e) => handleVertexCredentialsFileChange(
                              e,
                              (jsonText, parsed) => {
                                updateProvider(config.activeProvider, 'credentialsJson', jsonText);
                                if (!activeProvider?.projectId && parsed?.project_id) {
                                  updateProvider(config.activeProvider, 'projectId', String(parsed.project_id));
                                }
                              }
                            )}
                          />
                          <span className="text-xs text-gray-500">Uu tien nap file JSON thay vi dan tay.</span>
                        </div>
                        <textarea
                          value={activeProvider?.credentialsJson || ''}
                          onChange={(e) => updateProvider(config.activeProvider, 'credentialsJson', e.target.value)}
                          rows={7}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono text-xs"
                          placeholder={`{\n  \"type\": \"service_account\",\n  \"project_id\": \"...\",\n  \"client_email\": \"...\",\n  \"private_key\": \"-----BEGIN PRIVATE KEY-----...\"\n}`}
                        />
                        <p className="text-xs text-gray-500 mt-1">Dán nội dung file JSON service account. Không dùng P12.</p>
                      </div>
                    </div>
                  ) : (
                    <select
                      key={config.activeProvider}
                      value={activeProvider?.model || ''}
                      onChange={(e) => updateProvider(config.activeProvider, 'model', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                    >
                      {effectiveModelOptions.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={loadProviderModels}
                      disabled={loadingModels}
                      className="px-3 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition disabled:opacity-50"
                    >
                      {loadingModels
                        ? (isDialogflowCxProvider || isGoogleAgentSearchProvider ? 'Đang kiểm tra...' : 'Đang tải...')
                        : (isDialogflowCxProvider ? 'Kiểm tra Agent' : (isGoogleAgentSearchProvider ? 'Kiểm tra Engine' : 'Load Models'))}
                    </button>
                    {!isGoogleSalesProvider ? (
                      <button
                        type="button"
                        onClick={resetActiveProviderModel}
                        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 transition"
                      >
                        Mặc định
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {isGoogleSalesProvider
                      ? (isDialogflowCxProvider
                        ? 'Nhập Dialogflow CX Agent ID đã deploy. Bấm Kiểm tra Agent để xác nhận ID này.'
                        : 'Nhập Google Search / Sales Bot Engine ID đã deploy. Bấm Kiểm tra Engine để xác nhận ID này.')
                      : (effectiveModelOptions.find(m => m.value === activeProvider?.model)?.description || 'Chọn model phù hợp')}
                  </p>
                  {isGoogleSalesProvider ? (
                    <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                      {remoteModels[config.activeProvider]?.length ? (
                        <>
                          <div className="font-semibold">{remoteModels[config.activeProvider][0]?.label || activeProvider?.name || 'Google provider'}</div>
                          <div className="mt-1 text-[11px] text-green-800" title={remoteModels[config.activeProvider][0]?.value}>
                            {remoteModels[config.activeProvider][0]?.description || `ID: ${remoteModels[config.activeProvider][0]?.value || ''}`}
                          </div>
                        </>
                      ) : (
                        <div>Chưa kiểm tra. Bấm nút kiểm tra để xác nhận ID này.</div>
                      )}
                    </div>
                  ) : null}
                </div>

                {config.activeProvider === 'claude' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Base URL
                      </label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                          type="url"
                          value={activeProvider?.baseUrl || ''}
                          onChange={(e) => updateProvider('claude', 'baseUrl', e.target.value)}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="https://unlimited.aiprimetech.io"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">URL endpoint của AI provider dạng OpenAI-compatible.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Auth Token / API Key
                      </label>
                      <input
                        type="password"
                        value={activeProvider?.authToken || ''}
                        onChange={(e) => updateProvider('claude', 'authToken', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="sk-..."
                      />
                      <p className="text-xs text-gray-500 mt-1">Bearer token để xác thực với AI provider.</p>
                    </div>
                  </>
                )}

                {config.activeProvider === 'gemini' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Base URL (tùy chọn)
                      </label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                          type="url"
                          value={activeProvider?.baseUrl || ''}
                          onChange={(e) => updateProvider('gemini', 'baseUrl', e.target.value)}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="https://generativelanguage.googleapis.com/v1beta"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Mặc định: Google Gemini API endpoint.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={activeProvider?.apiKey || ''}
                        onChange={(e) => updateProvider('gemini', 'apiKey', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="AIzaSy..."
                      />
                      <p className="text-xs text-gray-500 mt-1">Google API Key từ Google AI Studio.</p>
                    </div>
                  </>
                )}

                {config.activeProvider === 'vertex' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        GCP Project ID
                      </label>
                      <input
                        type="text"
                        value={activeProvider?.projectId || ''}
                        onChange={(e) => updateProvider('vertex', 'projectId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="your-gcp-project-id"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <select
                        value={activeProvider?.location || 'global'}
                        onChange={(e) => updateProvider('vertex', 'location', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      >
                        {getVertexLocationOptions(activeProvider?.location).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Service Account JSON (Credentials)
                      </label>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => vertexCredentialsInputRef.current?.click()}
                          className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                        >
                          Chọn file JSON
                        </button>
                        <input
                          ref={vertexCredentialsInputRef}
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => handleVertexCredentialsFileChange(
                            e,
                            (jsonText, parsed) => {
                              updateProvider('vertex', 'credentialsJson', jsonText);
                              if (!activeProvider?.projectId && parsed?.project_id) {
                                updateProvider('vertex', 'projectId', String(parsed.project_id));
                              }
                            }
                          )}
                        />
                        <span className="text-xs text-gray-500">Khuyến nghị dùng file service account gốc để tránh lỗi dán tay.</span>
                      </div>
                      <textarea
                        value={activeProvider?.credentialsJson || ''}
                        onChange={(e) => updateProvider('vertex', 'credentialsJson', e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono text-xs"
                        placeholder={`{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "..."\n}`}
                      />
                      <p className="text-xs text-gray-500 mt-1">Nội dung file JSON credentials của GCP Service Account.</p>
                    </div>
                  </>
                )}

                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                  <button
                    type="button"
                    onClick={() => setShowAiPricingPanel((prev) => !prev)}
                    className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Bảng giá nội bộ AI app bán ra</div>
                      <div className="text-xs text-gray-500">
                        Ẩn mặc định. Dùng để set đơn giá theo token in/out và hệ số quy đổi cho app con.
                      </div>
                    </div>
                    <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 border border-gray-200">
                      {showAiPricingPanel ? 'Thu gọn' : 'Mở rộng'}
                    </span>
                  </button>

                  {showAiPricingPanel && (
                    <div className="mt-4 space-y-4">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={config.pricing.enabled}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            pricing: { ...prev.pricing, enabled: e.target.checked }
                          }))}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Bật tính giá nội bộ</span>
                      </label>

                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-amber-900">
                            Giá bán tham chiếu: 1 Dopi = bao nhiêu VND?
                          </span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={config.pricing.dopiValueVnd}
                            onChange={(e) => setConfig(prev => ({
                              ...prev,
                              pricing: {
                                ...prev.pricing,
                                dopiValueVnd: Math.max(1, parseInt(e.target.value, 10) || 1)
                              }
                            }))}
                            className="w-full max-w-[220px] rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-mono focus:border-amber-500 focus:ring-2 focus:ring-amber-500"
                          />
                        </label>
                        <p className="mt-1 text-xs text-amber-800">
                          User chỉ nhìn thấy số Dopi nguyên. Token thật vẫn được lưu để admin đối soát.
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        {AI_PRICING_TASKS.map((task) => {
                          const taskConfig = config.pricing.tasks[task.key];
                          return (
                            <div key={task.key} className="rounded-lg border border-gray-200 bg-white p-3">
                              <div className="mb-2">
                                <div className="text-sm font-medium text-gray-900">{task.label}</div>
                                <div className="text-xs text-gray-500">{task.description}</div>
                              </div>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                    Dopi Input / 1K token
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={taskConfig.inputPer1k}
                                    onChange={(e) => updateAiPricingTask(task.key, 'inputPer1k', parseFloat(e.target.value))}
                                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                    Dopi Output / 1K token
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={taskConfig.outputPer1k}
                                    onChange={(e) => updateAiPricingTask(task.key, 'outputPer1k', parseFloat(e.target.value))}
                                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                    Hệ số
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={taskConfig.multiplier}
                                    onChange={(e) => updateAiPricingTask(task.key, 'multiplier', parseFloat(e.target.value))}
                                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                        Token in/out sẽ được lấy tự động từ response của provider. Giá bên dưới là đơn giá nội bộ để quy đổi sang Dopi.
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={activeProvider?.enabled || false}
                      onChange={(e) => updateProvider(config.activeProvider, 'enabled', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Kích hoạt provider này
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-7">
                    Provider phải được kích hoạt mới có thể được chọn làm AI chính.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-sm font-medium text-amber-800 mb-2">Lưu ý quan trọng khi deploy</h3>
              <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                <li>Cấu hình này được lưu trong file <code>server/data/ai-providers.json</code></li>
                <li>Khi deploy lên VPS, <strong>không ghi đè</strong> thư mục <code>/data/</code> để tránh mất cấu hình</li>
                <li>Chỉ copy file <code>index.js</code> mới lên server</li>
                <li>API Key và Token được lưu plain text, cần đảm bảo file permissions hợp lý (600)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-6 grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-blue-600" />
               Cấu hình Web Support Bot nội bộ
            </h2>

            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={webSupportConfig.enabled}
                  onChange={(e) => updateWebSupportConfig('enabled', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                  <span className="text-sm font-medium text-gray-700">Kích hoạt Web Support Bot</span>
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider Type</label>
                <select
                  value={webSupportConfig.providerType}
                  onChange={(e) => handleWebSupportProviderTypeChange(e.target.value as WebSupportConfig['providerType'])}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                >
                  <option value="gemini">Gemini / Google AI Studio</option>
                  <option value="vertex_gemini">Vertex Gemini / Google Cloud</option>
                  <option value="dialogflow_cx">Google Chat / Dopi Gia Su</option>
                  <option value="google_agent_search">Google Search / Sales Bot</option>
                  <option value="openai_compatible">OpenAI compatible / Claude style</option>
                </select>
              </div>

              {webSupportConfig.providerType === 'gemini' || webSupportConfig.providerType === 'vertex_gemini' || webSupportConfig.providerType === 'openai_compatible' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      type="url"
                      value={webSupportConfig.baseUrl}
                      onChange={(e) => updateWebSupportConfig('baseUrl', e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="https://generativelanguage.googleapis.com/v1beta"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Endpoint riêng cho bot hỗ trợ nội bộ của web chủ.</p>
                </div>
              ) : null}

              {webSupportConfig.providerType === 'gemini' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Google API Key</label>
                  <input
                    type="password"
                    value={webSupportConfig.apiKey}
                    onChange={(e) => updateWebSupportConfig('apiKey', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                    placeholder="AIzaSy..."
                  />
                </div>
              ) : webSupportConfig.providerType === 'vertex_gemini' ? (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project ID</label>
                      <input
                        type="text"
                        value={webSupportConfig.projectId}
                        onChange={(e) => updateWebSupportConfig('projectId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="your-gcp-project-id"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <select
                        value={webSupportConfig.location || 'global'}
                        onChange={(e) => updateWebSupportConfig('location', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white font-mono"
                      >
                        {getVertexLocationOptions(webSupportConfig.location).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Google Cloud Credentials JSON</label>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => webSupportGeminiCredentialsInputRef.current?.click()}
                        className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                      >
                        Chọn file JSON
                      </button>
                        <input
                          ref={webSupportGeminiCredentialsInputRef}
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => handleVertexCredentialsFileChange(
                            e,
                            (jsonText, parsed) => {
                              updateWebSupportConfig('credentialsJson', jsonText);
                              if (!webSupportConfig.projectId && parsed?.project_id) {
                                updateWebSupportConfig('projectId', String(parsed.project_id));
                              }
                            }
                          )}
                        />
                      <span className="text-xs text-gray-500">Ưu tiên nạp file .json thay vì dán tay.</span>
                    </div>
                    <textarea
                      value={webSupportConfig.credentialsJson}
                      onChange={(e) => updateWebSupportConfig('credentialsJson', e.target.value)}
                      rows={7}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono text-xs"
                      placeholder={`{\n  "type": "service_account",\n  "project_id": "...",\n  "client_email": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----..."\n}`}
                    />
                    <p className="text-xs text-gray-500 mt-1">Dán nội dung file JSON service account. Không dùng P12.</p>
                  </div>
                </div>
              ) : webSupportConfig.providerType === 'dialogflow_cx' ? (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project ID</label>
                      <input
                        type="text"
                        value={webSupportConfig.projectId}
                        onChange={(e) => updateWebSupportConfig('projectId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="web-hochungkhoi-chatbot"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <select
                        value={webSupportConfig.location || 'global'}
                        onChange={(e) => updateWebSupportConfig('location', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white font-mono"
                      >
                        {getVertexLocationOptions(webSupportConfig.location).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Agent ID</label>
                      <input
                        type="text"
                        value={webSupportConfig.model}
                        onChange={(e) => updateWebSupportConfig('model', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="79129181-d156-4071-8bde-e8088f849e91"
                      />
                      <p className="text-xs text-gray-500 mt-1">Dùng Agent ID trong Dialogflow CX, không dùng tên hiển thị.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Language Code</label>
                      <input
                        type="text"
                        value={webSupportConfig.languageCode || 'vi'}
                        onChange={(e) => updateWebSupportConfig('languageCode', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="vi"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Google Cloud Credentials JSON</label>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => webSupportAgentCredentialsInputRef.current?.click()}
                        className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                      >
                        Chọn file JSON
                      </button>
                        <input
                          ref={webSupportAgentCredentialsInputRef}
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => handleVertexCredentialsFileChange(
                            e,
                            (jsonText, parsed) => {
                              updateWebSupportConfig('credentialsJson', jsonText);
                              if (!webSupportConfig.projectId && parsed?.project_id) {
                                updateWebSupportConfig('projectId', String(parsed.project_id));
                              }
                            }
                          )}
                        />
                      <span className="text-xs text-gray-500">Dùng file service account gốc để tránh sai định dạng.</span>
                    </div>
                    <textarea
                      value={webSupportConfig.credentialsJson}
                      onChange={(e) => updateWebSupportConfig('credentialsJson', e.target.value)}
                      rows={7}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono text-xs"
                      placeholder={`{\n  "type": "service_account",\n  "project_id": "...",\n  "client_email": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----..."\n}`}
                    />
                    <p className="text-xs text-gray-500 mt-1">Dán nội dung file JSON service account. Không dùng P12.</p>
                  </div>
                </div>
              ) : webSupportConfig.providerType === 'google_agent_search' ? (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project ID</label>
                      <input
                        type="text"
                        value={webSupportConfig.projectId}
                        onChange={(e) => updateWebSupportConfig('projectId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="web-hochungkhoi-chatbot"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <select
                        value={webSupportConfig.location || 'global'}
                        onChange={(e) => updateWebSupportConfig('location', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white font-mono"
                      >
                        {getVertexLocationOptions(webSupportConfig.location).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Engine / App ID</label>
                      <input
                        type="text"
                        value={webSupportConfig.model}
                        onChange={(e) => updateWebSupportConfig('model', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="hoc-chung-khoi-tu-van_1780386592569"
                      />
                      <p className="text-xs text-gray-500 mt-1">Dùng App/Engine ID trong AI Applications, không dùng Data Store ID, không dùng tên hiển thị.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Serving Config ID</label>
                      <input
                        type="text"
                        value={webSupportConfig.servingConfigId || 'default_serving_config'}
                        onChange={(e) => updateWebSupportConfig('servingConfigId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="default_serving_config"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Google Cloud Credentials JSON</label>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => webSupportAgentCredentialsInputRef.current?.click()}
                        className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                      >
                        Chọn file JSON
                      </button>
                        <input
                          ref={webSupportAgentCredentialsInputRef}
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => handleVertexCredentialsFileChange(
                            e,
                            (jsonText, parsed) => {
                              updateWebSupportConfig('credentialsJson', jsonText);
                              if (!webSupportConfig.projectId && parsed?.project_id) {
                                updateWebSupportConfig('projectId', String(parsed.project_id));
                              }
                            }
                          )}
                        />
                      <span className="text-xs text-gray-500">Dùng file service account gốc để tránh sai định dạng.</span>
                    </div>
                    <textarea
                      value={webSupportConfig.credentialsJson}
                      onChange={(e) => updateWebSupportConfig('credentialsJson', e.target.value)}
                      rows={7}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono text-xs"
                      placeholder={`{\n  "type": "service_account",\n  "project_id": "...",\n  "client_email": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----..."\n}`}
                    />
                    <p className="text-xs text-gray-500 mt-1">Dán nội dung file JSON service account. Không dùng P12.</p>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Auth Token / API Key</label>
                  <input
                    type="password"
                    value={webSupportConfig.authToken}
                    onChange={(e) => updateWebSupportConfig('authToken', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                    placeholder="sk-..."
                  />
                </div>
              )}

                {webSupportConfig.providerType !== 'dialogflow_cx' && webSupportConfig.providerType !== 'google_agent_search' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                    {effectiveWebSupportModelOptions.length > 0 ? (
                      <select
                        value={webSupportConfig.model}
                        onChange={(e) => updateWebSupportConfig('model', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                      >
                        {effectiveWebSupportModelOptions.map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={webSupportConfig.model}
                        onChange={(e) => updateWebSupportConfig('model', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                        placeholder="gemini-2.0-flash"
                      />
                    )}
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={loadWebSupportModels}
                        disabled={loadingWebSupportModels}
                        className="px-3 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition disabled:opacity-50"
                      >
                        {loadingWebSupportModels ? 'Đang tải...' : 'Load Models'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setWebSupportConfig(prev => ({ ...prev, model: DEFAULT_WEB_SUPPORT_CONFIG.model }))}
                        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 transition"
                      >
                        Load Default
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {effectiveWebSupportModelOptions.find(m => m.value === webSupportConfig.model)?.description || 'Chọn model phù hợp'}
                    </p>
                  </div>
                ) : null}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                <textarea
                  value={webSupportConfig.systemPrompt}
                  onChange={(e) => updateWebSupportConfig('systemPrompt', e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                <button
                  type="button"
                  onClick={() => setShowPricingPanel((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Bảng giá nội bộ Web Support</div>
                    <div className="text-xs text-gray-500">
                      Ẩn mặc định. Dùng để set đơn giá cho token in/out và hệ số theo từng loại thao tác.
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 border border-gray-200">
                    {showPricingPanel ? 'Thu gọn' : 'Mở rộng'}
                  </span>
                </button>

                {showPricingPanel && (
                  <div className="mt-4 space-y-4">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={webSupportConfig.pricing.enabled}
                        onChange={(e) => setWebSupportConfig(prev => ({
                          ...prev,
                          pricing: { ...prev.pricing, enabled: e.target.checked }
                        }))}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Bật tính giá nội bộ</span>
                    </label>

                    <div className="grid gap-3 md:grid-cols-2">
                      {WEB_SUPPORT_PRICING_TASKS.map((task) => {
                        const taskConfig = webSupportConfig.pricing.tasks[task.key];
                        return (
                          <div key={task.key} className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="mb-2">
                              <div className="text-sm font-medium text-gray-900">{task.label}</div>
                              <div className="text-xs text-gray-500">{task.description}</div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                  Input / 1K
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={taskConfig.inputPer1k}
                                  onChange={(e) => updateWebSupportPricingTask(task.key, 'inputPer1k', parseFloat(e.target.value))}
                                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                  Output / 1K
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={taskConfig.outputPer1k}
                                  onChange={(e) => updateWebSupportPricingTask(task.key, 'outputPer1k', parseFloat(e.target.value))}
                                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                                  H? s?
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={taskConfig.multiplier}
                                  onChange={(e) => updateWebSupportPricingTask(task.key, 'multiplier', parseFloat(e.target.value))}
                                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                      Token in/out sẽ lấy tự động từ response khi provider hỗ trợ. Giá bạn nhập ở đây chỉ là đơn giá nội bộ để admin tham chiếu chi phí.
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveWebSupport}
                disabled={savingSupport}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
              >
                <Save className="h-4 w-4" />
                {savingSupport ? 'Đang lưu...' : 'Lưu cấu hình Web Support'}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                Telegram Notify
              </h2>

              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={webSupportConfig.telegram.enabled}
                    onChange={(e) => updateWebSupportTelegram('enabled', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">Bật thông báo Telegram</span>
                </label>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bot Token</label>
                  <input
                    type="password"
                    value={webSupportConfig.telegram.botToken}
                    onChange={(e) => updateWebSupportTelegram('botToken', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                    placeholder="123456:ABC..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chat ID</label>
                  <input
                    type="text"
                    value={webSupportConfig.telegram.chatId}
                    onChange={(e) => updateWebSupportTelegram('chatId', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                    placeholder="-1001234567890"
                  />
                </div>

                                <div className="space-y-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={webSupportConfig.telegram.notifyOnNewChat}
                      onChange={(e) => updateWebSupportTelegram('notifyOnNewChat', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Thông báo khi có chat mới</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={webSupportConfig.telegram.notifyOnLead}
                      onChange={(e) => updateWebSupportTelegram('notifyOnLead', e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Thông báo khi phát hi?n lead</span>
                  </label>
                  <p className="text-xs text-gray-500">
                    Telegram sẽ báo 1 lần cho chat mới và 1 lần khi phát hiện lead. Không báo từng câu trả lời AI.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    disabled={testingTelegram}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 font-medium"
                  >
                    {testingTelegram ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {testingTelegram ? 'Đang test...' : 'Test Telegram'}
                  </button>
                  <button
                    type="button"
                    onClick={() => loadWebSupportData()}
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
                  >
                    Tải lại
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-200 p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-blue-600" />
                  Log gần đây
                </h2>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{webSupportLogs.length} b?n ghi</span>
                  <button
                    type="button"
                    onClick={toggleAllWebSupportLogs}
                    disabled={!webSupportLogs.length}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    {allWebSupportLogsSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedWebSupportLogs}
                    disabled={!selectedWebSupportLogIds.length || deletingWebSupportLogs}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingWebSupportLogs ? 'Đang xoá...' : `Xóa đã chọn${selectedWebSupportLogIds.length ? ` (${selectedWebSupportLogIds.length})` : ''}`}
                  </button>
                </div>
              </div>
              <div className="mb-3 rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Chọn một hoặc nhiều log rồi bấm <span className="font-semibold">Xóa đã chọn</span>. Log nội bộ sẽ được dọn ngay, không ảnh hưởng chat bot.
              </div>

              {loadingSupport ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-gray-400" />
                  Đang tải log...
                </div>
              ) : webSupportLogs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                  Chưa có log nào từ Web Support Bot.
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
                  {webSupportLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedWebSupportLogSet.has(log.id)}
                          onChange={(e) => {
                            setSelectedWebSupportLogIds((prev) =>
                              e.target.checked
                                ? Array.from(new Set([...prev, log.id]))
                                : prev.filter((id) => id !== log.id)
                            );
                          }}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-2">
                            <span>{new Date(log.createdAt).toLocaleString('vi-VN')}</span>
                            {log.source && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{log.source}</span>}
                            {log.isLead && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Lead</span>}
                            {log.telegramStatus && (
                              <span className={`px-2 py-0.5 rounded-full ${log.telegramStatus === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                Telegram: {log.telegramStatus}
                              </span>
                            )}
                          </div>
                      <div className="text-gray-800 font-medium mb-1">{log.userMessage}</div>
                      {log.assistantMessage && (
                        <div className="text-gray-600 text-xs leading-5">
                          <span className="font-semibold text-gray-700">Bot:</span> {log.assistantMessage}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                        {log.visitorName && <span>Tên: {log.visitorName}</span>}
                        {log.visitorEmail && <span>Email: {log.visitorEmail}</span>}
                        {log.detectedPhones?.length ? <span>SĐT: {log.detectedPhones.join(', ')}</span> : null}
                        {log.detectedEmails?.length ? <span>Email phát hiện: {log.detectedEmails.join(', ')}</span> : null}
                      </div>
                      {log.telegramError && (
                        <div className="mt-2 text-xs text-red-600">Telegram lỗi: {log.telegramError}</div>
                      )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

export default AdminAiSettingsPage;



