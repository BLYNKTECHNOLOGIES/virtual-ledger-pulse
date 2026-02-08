
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
          <div className="p-2.5 bg-amber-500/10 rounded-xl">
            <Users className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Staff Management</h2>
            <p className="text-sm text-muted-foreground">Manage team members and their roles</p>
          </div>
        </div>
        <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2">
          <Plus className="h-4 w-4" /> Add Staff
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground h-11 focus:border-primary/50"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px] bg-secondary border-border text-foreground h-11">
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
          <Card key={member.id} className="bg-card border-border shadow-none">
            <CardContent className="pt-6 pb-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-500 dark:text-amber-400 font-bold border border-amber-500/20">
                    U
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full mt-2 ${member.isActive ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
              </div>

              <Badge
                variant="outline"
                className={`mb-4 text-xs px-3 py-1 ${member.role === 'SMALL_SALES'
                  ? 'bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/25'
                  : 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/25'
                }`}
              >
                {member.role.replace('_', ' ')}
              </Badge>

              <div className="flex items-center gap-2 mt-3">
                <Select value={member.role} onValueChange={(v) => updateRole(member.id, v)}>
                  <SelectTrigger className="flex-1 bg-muted border-border text-foreground h-9 text-xs">
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
                  className={`h-9 w-9 ${member.isActive
                    ? 'border-red-600/60 text-red-500 dark:text-red-400 hover:bg-red-500/10'
                    : 'border-emerald-600/60 text-emerald-500 dark:text-emerald-400 hover:bg-emerald-500/10'
                  }`}
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
