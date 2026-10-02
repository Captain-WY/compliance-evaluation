
import React, { useEffect, useState } from 'react';
import { getMyEvidenceTasks, submitEvidenceTask, type EvidenceTaskRecord } from '../../services/case';
import { useFileUpload } from '../../src/hooks/useFileUpload';
import { FileText, Upload, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import Button from '../../components/ui/Button';

const EvidenceResponse: React.FC = () => {
  const [tasks, setTasks] = useState<EvidenceTaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { uploading, uploadFiles } = useFileUpload({ businessType: 'GENERAL' });

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    const data = await getMyEvidenceTasks();
    setTasks(data);
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async () => {
    if (!selectedTask || files.length === 0) return;
    setSubmitting(true);

    // 先上传文件，拿到 objectKey 列表
    const uploaded = await uploadFiles(files, selectedTask);
    const fileUrls = uploaded.map(f => f.fileUrl);

    if (fileUrls.length === 0) {
      setSubmitting(false);
      return;
    }

    await submitEvidenceTask({ taskId: selectedTask, fileUrls });
    setSubmitting(false);
    setSelectedTask(null);
    setFiles([]);
    loadTasks();
  };

  if (loading) return <div className="p-8 text-center text-slate-400">加载任务列表...</div>;

  return (
    <div className="space-y-6">
       {/* Active Tasks */}
       <div className="space-y-4">
           <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
               <AlertTriangle className="w-5 h-5 text-brand-600" /> 待处理取证请求
           </h3>

           {tasks.filter(t => t.status === 'PENDING' || t.status === 'REJECTED').map(task => (
               <div key={task.taskId} className={`bg-white border rounded-xl p-5 shadow-sm transition-all ${selectedTask === task.taskId ? 'border-brand-500 ring-1 ring-brand-200' : 'border-slate-200'}`}>
                   <div className="flex justify-between items-start mb-3">
                       <div>
                           <div className="flex items-center gap-2">
                               <h4 className="font-bold text-slate-800">{task.title}</h4>
                               {task.status === 'REJECTED' && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">被驳回: {task.rejectReason}</span>}
                           </div>
                           <p className="text-sm text-slate-600 mt-1">{task.description}</p>
                           <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                               <span className="font-mono bg-slate-50 px-1 rounded">Case: {task.caseTitle}</span>
                               <span className="text-red-500 flex items-center gap-1"><Clock className="w-3 h-3"/> 截止: {task.deadline}</span>
                           </div>
                       </div>

                       {selectedTask !== task.taskId && (
                           <Button size="sm" onClick={() => setSelectedTask(task.taskId)}>去处理</Button>
                       )}
                   </div>

                   {/* Upload Area */}
                   {selectedTask === task.taskId && (
                       <div className="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-200 animate-in fade-in">
                           <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:bg-white transition-colors relative">
                               <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} />
                               <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                               <p className="text-sm text-slate-600 font-medium">点击上传证据文件</p>
                               <p className="text-xs text-slate-400">支持 PDF, JPG, Excel, ZIP</p>
                           </div>

                           {files.length > 0 && (
                               <div className="mt-3 space-y-1">
                                   {files.map((f, i) => (
                                       <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                                           <FileText className="w-4 h-4 text-brand-500" /> {f.name}
                                       </div>
                                   ))}
                               </div>
                           )}

                           <div className="flex justify-end gap-2 mt-4">
                               <Button variant="ghost" size="sm" onClick={() => { setSelectedTask(null); setFiles([]); }}>取消</Button>
                               <Button size="sm" onClick={handleSubmit} isLoading={submitting || uploading} disabled={files.length === 0 || uploading}>
                                 {uploading ? '上传中...' : '提交法务部'}
                               </Button>
                           </div>
                       </div>
                   )}
               </div>
           ))}
           {tasks.filter(t => t.status === 'PENDING' || t.status === 'REJECTED').length === 0 && (
               <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                   太棒了！所有任务已处理完毕 🎉
               </div>
           )}
       </div>

       {/* History */}
       <div className="mt-8 pt-8 border-t border-slate-200">
           <h3 className="font-bold text-slate-500 text-sm uppercase mb-4">已提交记录</h3>
           <div className="space-y-3 opacity-75">
               {tasks.filter(t => t.status === 'SUBMITTED' || t.status === 'APPROVED').map(task => (
                   <div key={task.taskId} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex justify-between items-center">
                       <div>
                           <h4 className="font-bold text-slate-700 text-sm">{task.title}</h4>
                           <p className="text-xs text-slate-500 mt-0.5">提交于: {task.submitDate}</p>
                       </div>
                       <div>
                           {task.status === 'APPROVED' ? (
                               <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded">
                                   <CheckCircle2 className="w-4 h-4" /> 已归档
                               </span>
                           ) : (
                               <span className="flex items-center gap-1 text-blue-600 text-xs font-bold bg-blue-50 px-2 py-1 rounded">
                                   <Clock className="w-4 h-4" /> 审核中
                               </span>
                           )}
                       </div>
                   </div>
               ))}
           </div>
       </div>
    </div>
  );
};

export default EvidenceResponse;
