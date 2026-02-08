
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Power, Users } from 'lucide-react';
import { mockStaff, OPStaffMember } from './mockData';
import { useToast } from '@/hooks/use-toast';

export function OPStaffManagement() {
  const [staff, setStaff] = useState<OPStaffMember[]>(mockStaff);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const { toast } = useToast();

  const filtered = staff.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || s.role === roleFilter;
    return matchSearch && matchRole;
  });

  const toggleActive = (id: string) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s));
    toast({ title: 'Staff status updated' });
  };

  const updateRole = (id: string, role: string) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, role: role as OPStaffMember['role'] } : s));
    toast({ title: 'Role updated' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <Users className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-100">Staff Management</h2>
            <p className="text-gray-400">Manage team members and their roles</p>
          </div>
        </div>
        <Button className="bg-amber-500 hover:bg-amber-600 text-black font-medium">
          <Plus className="h-4 w-4 mr-2" /> Add Staff
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-gray-900/50 border-gray-700 text-gray-200 placeholder:text-gray-500"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px] bg-gray-900/50 border-gray-700 text-gray-200">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="SMALL_SALES">Small Sales</SelectItem>
            <SelectItem value="LARGE_SALES">Large Sales</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((member) => (
          <Card key={member.id} className="bg-gray-900/60 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
                    U
                  </div>
                  <div>
                    <p className="font-medium text-gray-200">{member.name}</p>
                    <p className="text-sm text-gray-500">{member.email}</p>
                  </div>
                </div>
                <div className={`w-3 h-3 rounded-full mt-1 ${member.isActive ? 'bg-emerald-400' : 'bg-gray-600'}`} />
              </div>

              <Badge variant="outline" className={`mb-4 ${member.role === 'SMALL_SALES' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                {member.role.replace('_', ' ')}
              </Badge>

              <div className="flex items-center gap-2 mt-4">
                <Select value={member.role} onValueChange={(v) => updateRole(member.id, v)}>
                  <SelectTrigger className="flex-1 bg-gray-800 border-gray-700 text-gray-300 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SMALL_SALES">Small Sales</SelectItem>
                    <SelectItem value="LARGE_SALES">Large Sales</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="outline"
                  className={`h-9 w-9 ${member.isActive ? 'border-red-600 text-red-400 hover:bg-red-600/20' : 'border-emerald-600 text-emerald-400 hover:bg-emerald-600/20'}`}
                  onClick={() => toggleActive(member.id)}
                >
                  <Power className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
