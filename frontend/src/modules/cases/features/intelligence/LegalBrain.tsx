import React, { useState } from 'react';
import { Search, Sparkles, BookOpen, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import { searchSimilarCasesBff, type SimilarCaseRecord } from '../../services/case';

const OUTCOME_STYLE: Record<string, string> = {
  WIN: 'bg-emerald-50 text-emerald-700',
  LOSE: 'bg-red-50 text-red-700',
  SETTLE: 'bg-amber-50 text-amber-700',
};

const LegalBrain: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SimilarCaseRecord[]>([]);
  const [isStub, setIsStub] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    const res = await searchSimilarCasesBff(query.trim());
    setResults(res.items);
    setIsStub(res.isStub);
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-slate-900 rounded-xl p-8 text-white relative overflow-hidden shadow-xl">
        <div className="relative z-10 max-w-3xl">
          <h2 className="text-3xl font-bold mb-4 flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-brand-400" />
            SLD Legal Brain
          </h2>
          <p className="text-slate-300 mb-8 text-lg">
            基于历史判例与内部知识库，为您提供类案检索服务。
          </p>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                className="w-full pl-12 pr-4 py-4 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-brand-500 outline-none text-lg"
                placeholder="输入案情描述，例如：'融资融券强平纠纷，未发送追加保证金通知'..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button size="lg" onClick={handleSearch} isLoading={loading} className="px-8 bg-brand-600 hover:bg-brand-500">
              AI 检索
            </Button>
          </div>
        </div>

        <div className="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-l from-brand-900/50 to-transparent pointer-events-none" />
        <div className="absolute -right-10 -bottom-20 w-64 h-64 bg-brand-500/20 rounded-full blur-3xl" />
      </div>

      {/* Stub Notice */}
      {searched && isStub && (
        <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-500">
          <AlertCircle className="w-4 h-4 shrink-0 text-slate-400" />
          当前为 AI 模拟结果，实际推理引擎部署后将自动切换为真实语义检索
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand-600" /> 类案推荐
            </h3>
            <span className="text-xs text-slate-400">找到 {results.length} 条相似判例</span>
          </div>

          <div className="divide-y divide-slate-100">
            {results.map((item, idx) => (
              <div key={item.caseId || idx} className="p-6 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-brand-700 text-base">{item.caseName}</h4>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                    <span className="text-xs font-bold text-slate-400 uppercase">相似度</span>
                    <span className="text-xl font-bold text-brand-600">{Math.round(item.similarity * 100)}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {item.outcomeName && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${OUTCOME_STYLE[item.outcome ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                      {item.outcomeName}
                    </span>
                  )}
                  {item.amount != null && (
                    <span className="text-xs text-slate-500">
                      金额: ¥{(item.amount / 10000).toFixed(0)} 万
                    </span>
                  )}
                  {item.isStub && (
                    <span className="text-xs border border-dashed border-slate-300 text-slate-400 px-2 py-0.5 rounded">模拟数据</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && searched && results.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-200" />
          <p>未找到相关判例，请尝试调整描述</p>
        </div>
      )}

      {!searched && (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-medium text-slate-600">等待输入...</h3>
          <p className="text-slate-400 mt-2 max-w-md mx-auto text-sm">
            请输入案件的关键事实、争议焦点或法律问题，AI 将为您检索相似的历史判例。
          </p>
        </div>
      )}
    </div>
  );
};

export default LegalBrain;
