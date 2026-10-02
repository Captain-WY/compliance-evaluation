import React, { useEffect, useState, useCallback } from 'react';
import {
  X, Download, ZoomIn, ZoomOut, RotateCw, FileText,
  Image as ImageIcon, Film, Music, FileArchive, AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../../src/hooks/useAuth';

export type PreviewFileType =
  | 'pdf'
  | 'doc' | 'docx'
  | 'xls' | 'xlsx'
  | 'ppt' | 'pptx'
  | 'jpg' | 'jpeg' | 'png' | 'gif' | 'bmp' | 'tiff' | 'webp'
  | 'txt' | 'csv' | 'md' | 'rtf'
  | 'mp3' | 'wav'
  | 'mp4' | 'avi' | 'mov' | 'wmv'
  | 'zip' | 'rar' | '7z' | 'tar' | 'gz'
  | 'other';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewUrl: string | null;
  fileName: string;
  fileType: PreviewFileType;
  onDownload?: () => void;
}

const IMAGE_TYPES: PreviewFileType[] = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'];
const TEXT_TYPES: PreviewFileType[] = ['txt', 'csv', 'md', 'rtf'];
const AUDIO_TYPES: PreviewFileType[] = ['mp3', 'wav'];
const VIDEO_TYPES: PreviewFileType[] = ['mp4', 'avi', 'mov', 'wmv'];
const OFFICE_TYPES: PreviewFileType[] = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
const ARCHIVE_TYPES: PreviewFileType[] = ['zip', 'rar', '7z', 'tar', 'gz'];

function isImage(type: PreviewFileType): boolean { return IMAGE_TYPES.includes(type); }
function isText(type: PreviewFileType): boolean { return TEXT_TYPES.includes(type); }
function isAudio(type: PreviewFileType): boolean { return AUDIO_TYPES.includes(type); }
function isVideo(type: PreviewFileType): boolean { return VIDEO_TYPES.includes(type); }
function isOffice(type: PreviewFileType): boolean { return OFFICE_TYPES.includes(type); }
function isArchive(type: PreviewFileType): boolean { return ARCHIVE_TYPES.includes(type); }

const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  previewUrl,
  fileName,
  fileType,
  onDownload,
}) => {
  const { user: currentUser } = useAuth();

  // Zoom state for images
  const [zoom, setZoom] = useState(1);
  // Rotation state for images
  const [rotation, setRotation] = useState(0);
  // Text content for text files
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  // Generic error state
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reset states when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setTextContent(null);
      setTextError(null);
      setLoadError(null);
    }
  }, [isOpen]);

  // Fetch text content for text files
  useEffect(() => {
    if (!isOpen || !previewUrl || !isText(fileType)) return;

    let cancelled = false;
    setTextLoading(true);
    setTextError(null);

    fetch(previewUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        if (!cancelled) {
          // Truncate very large text files
          const maxLen = 500_000;
          setTextContent(text.length > maxLen ? text.slice(0, maxLen) + '\n\n[内容过长，已截断显示]' : text);
        }
      })
      .catch(err => {
        if (!cancelled) setTextError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, previewUrl, fileType]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 5)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.25)), []);
  const handleRotate = useCallback(() => setRotation(r => (r + 90) % 360), []);
  const handleReset = useCallback(() => { setZoom(1); setRotation(0); }, []);

  // Keyboard shortcuts: ESC to close, +/- to zoom
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === '0') handleReset();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, handleZoomIn, handleZoomOut, handleReset]);

  if (!isOpen) return null;

  const watermarkText = `${currentUser?.name ?? currentUser?.username ?? currentUser?.id ?? 'Unknown'} | ${new Date().toLocaleString('zh-CN')}`;

  const renderPreview = () => {
    if (!previewUrl) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">正在加载预览...</p>
          </div>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center text-slate-400">
            <AlertCircle className="w-12 h-12 mb-3 text-amber-500" />
            <p className="text-sm">{loadError}</p>
          </div>
        </div>
      );
    }

    // PDF preview: use iframe with native browser support
    if (fileType === 'pdf') {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-700">
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title={fileName}
            onError={() => setLoadError('PDF 预览加载失败')}
          />
        </div>
      );
    }

    // Image preview: img with zoom and rotate
    if (isImage(fileType)) {
      return (
        <div className="w-full h-full flex items-center justify-center overflow-auto bg-slate-700">
          <img
            src={previewUrl}
            alt={fileName}
            className="max-w-none transition-transform duration-200 ease-out"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
            onError={() => setLoadError('图片加载失败')}
            draggable={false}
          />
        </div>
      );
    }

    // Text preview: preformatted text
    if (isText(fileType)) {
      if (textLoading) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">正在加载文本内容...</p>
            </div>
          </div>
        );
      }
      if (textError) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center text-slate-400">
              <AlertCircle className="w-10 h-10 mb-3 text-amber-500" />
              <p className="text-sm">文本加载失败: {textError}</p>
            </div>
          </div>
        );
      }
      return (
        <div className="w-full h-full overflow-auto bg-white">
          <pre className="p-8 text-sm text-slate-700 font-mono whitespace-pre-wrap break-words leading-relaxed">
            {textContent ?? ''}
          </pre>
        </div>
      );
    }

    // Audio preview
    if (isAudio(fileType)) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-800">
          <div className="flex flex-col items-center">
            <Music className="w-16 h-16 text-slate-400 mb-6" />
            <p className="text-white text-lg mb-4 font-medium">{fileName}</p>
            <audio
              controls
              className="w-80"
              src={previewUrl}
              onError={() => setLoadError('音频加载失败')}
            >
              您的浏览器不支持音频播放
            </audio>
          </div>
        </div>
      );
    }

    // Video preview
    if (isVideo(fileType)) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-900">
          <video
            controls
            className="max-w-full max-h-full"
            src={previewUrl}
            onError={() => setLoadError('视频加载失败')}
          >
            您的浏览器不支持视频播放
          </video>
        </div>
      );
    }

    // Office / Archive / Other: unsupported prompt
    const typeLabel = isOffice(fileType) ? 'Office 文档' : isArchive(fileType) ? '压缩包' : '该类型文件';
    const icon = isOffice(fileType) ? <FileText className="w-16 h-16 text-blue-400 mb-4" />
      : isArchive(fileType) ? <FileArchive className="w-16 h-16 text-amber-400 mb-4" />
        : <AlertCircle className="w-16 h-16 text-slate-400 mb-4" />;

    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-800">
        <div className="flex flex-col items-center text-center px-8">
          {icon}
          <p className="text-white text-lg font-medium mb-2">{fileName}</p>
          <p className="text-slate-400 text-sm mb-6">
            {typeLabel}暂不支持在线预览，请下载后使用本地软件查看
          </p>
          {onDownload && (
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" /> 下载文件
            </button>
          )}
        </div>
      </div>
    );
  };

  const showZoomControls = isImage(fileType);
  const showUnsupportedPrompt = isOffice(fileType) || isArchive(fileType) || (!isImage(fileType) && fileType !== 'pdf' && !isText(fileType) && !isAudio(fileType) && !isVideo(fileType));

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-3 bg-slate-900 text-white shadow-md z-20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {fileType === 'pdf' && <FileText className="w-5 h-5 text-red-400 shrink-0" />}
          {isImage(fileType) && <ImageIcon className="w-5 h-5 text-purple-400 shrink-0" />}
          {isVideo(fileType) && <Film className="w-5 h-5 text-emerald-400 shrink-0" />}
          {isAudio(fileType) && <Music className="w-5 h-5 text-amber-400 shrink-0" />}
          {(isOffice(fileType) || isArchive(fileType) || fileType === 'other') && <FileText className="w-5 h-5 text-slate-400 shrink-0" />}
          <div className="min-w-0">
            <h3 className="font-bold text-sm truncate">{fileName}</h3>
            <p className="text-[11px] text-slate-400">安全预览模式 | 水印追踪开启 | ESC 退出</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls for images */}
          {showZoomControls && (
            <div className="flex items-center gap-1 mr-2 bg-slate-800 rounded-lg p-1">
              <button
                onClick={handleZoomOut}
                className="p-1.5 hover:bg-slate-700 rounded text-slate-300"
                title="缩小 (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 w-12 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 hover:bg-slate-700 rounded text-slate-300"
                title="放大 (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleRotate}
                className="p-1.5 hover:bg-slate-700 rounded text-slate-300"
                title="旋转"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleReset}
                className="px-2 py-1 hover:bg-slate-700 rounded text-xs text-slate-300"
                title="重置 (0)"
              >
                重置
              </button>
            </div>
          )}

          {/* Download button (always available except when already showing prominent download in unsupported view) */}
          {!showUnsupportedPrompt && onDownload && (
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors text-xs"
            >
              <Download className="w-3.5 h-3.5" /> 下载
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            title="关闭 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Preview Area with Watermark */}
      <div className="flex-1 relative overflow-hidden">
        {/* Watermark Overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute text-white/[0.07] font-bold text-sm whitespace-nowrap -rotate-45"
              style={{
                top: `${Math.floor(i / 5) * 20}%`,
                left: `${(i % 5) * 25}%`,
                textShadow: '0 1px 2px rgba(0,0,0,0.25)',
              }}
            >
              {watermarkText}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="relative z-0 w-full h-full">
          {renderPreview()}
        </div>
      </div>
    </div>
  );
};

export default DocumentPreviewModal;
