import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Trophy, FileSpreadsheet, Search } from 'lucide-react';

interface ScoreDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName?: string;
}

export default function ScoreDashboardDialog({ open, onOpenChange, instanceName = '2025年Q4营业部综合考核' }: ScoreDashboardDialogProps) {
  const navigate = useNavigate();

  const handleViewDossier = (orgId: string) => {
    onOpenChange(false);
    navigate(`/review?instanceId=2025Q4&orgId=${orgId}&mode=readonly`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] h-[85vh] flex flex-col bg-slate-50 p-0 overflow-hidden">
        {/* Header (Sticky Top) */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500"/> 
              全景成绩单 (Score Dashboard)
            </h2>
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">{instanceName}</Badge>
          </div>
          <Button variant="outline" className="text-slate-600 border-slate-300 hover:bg-slate-100">
            <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600"/> 
            导出完整成绩单 (.xlsx)
          </Button>
        </div>

        {/* Data Table */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">排名 (Rank)</TableHead>
                  <TableHead className="font-semibold text-slate-700">参评机构 (Institution)</TableHead>
                  <TableHead className="font-semibold text-slate-700">最终得分 (Total Score)</TableHead>
                  <TableHead className="font-semibold text-slate-700">考核评级 (Grade)</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">审计操作 (Audit Action)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="hover:bg-slate-50">
                  <TableCell><span className="font-bold text-amber-500">1</span></TableCell>
                  <TableCell className="font-medium text-slate-800">上海分公司</TableCell>
                  <TableCell><span className="font-bold text-slate-900">95.5</span></TableCell>
                  <TableCell><Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-700 border-transparent shadow-none">A</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" className="bg-slate-800 hover:bg-slate-700 text-white" onClick={() => handleViewDossier('sh')}>
                      <Search className="w-3 h-3 mr-1"/> 调阅历史卷宗
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow className="hover:bg-slate-50">
                  <TableCell><span className="font-bold text-slate-400">2</span></TableCell>
                  <TableCell className="font-medium text-slate-800">深圳分公司</TableCell>
                  <TableCell><span className="font-bold text-slate-900">92.0</span></TableCell>
                  <TableCell><Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-700 border-transparent shadow-none">A</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" className="bg-slate-800 hover:bg-slate-700 text-white" onClick={() => handleViewDossier('sz')}>
                      <Search className="w-3 h-3 mr-1"/> 调阅历史卷宗
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow className="hover:bg-slate-50">
                  <TableCell><span className="font-bold text-amber-700">3</span></TableCell>
                  <TableCell className="font-medium text-slate-800">北京分公司</TableCell>
                  <TableCell><span className="font-bold text-slate-900">89.5</span></TableCell>
                  <TableCell><Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-700 border-transparent shadow-none">A</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" className="bg-slate-800 hover:bg-slate-700 text-white" onClick={() => handleViewDossier('bj')}>
                      <Search className="w-3 h-3 mr-1"/> 调阅历史卷宗
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow className="hover:bg-slate-50">
                  <TableCell><span className="text-slate-500">35</span></TableCell>
                  <TableCell className="font-medium text-slate-800">广州分公司</TableCell>
                  <TableCell><span className="font-bold text-slate-900">76.5</span></TableCell>
                  <TableCell><Badge className="bg-amber-100 hover:bg-amber-100 text-amber-700 border-transparent shadow-none">C</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" className="bg-slate-800 hover:bg-slate-700 text-white" onClick={() => handleViewDossier('gz')}>
                      <Search className="w-3 h-3 mr-1"/> 调阅历史卷宗
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
