
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MessageCircle, Phone, Mail, Calendar, Edit, Save, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { PermissionGate } from "@/components/PermissionGate";

interface PurposeCommunicationProps {
  clientId?: string;
}

export function PurposeCommunication({ clientId }: PurposeCommunicationProps) {
  const params = useParams();
  const activeClientId = clientId || params.id;
  const queryClient = useQueryClient();
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingFollowup, setIsEditingFollowup] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [editedFollowupDate, setEditedFollowupDate] = useState("");

  // Fetch client data
  const { data: client, isLoading } = useQuery({
    queryKey: ['client', activeClientId],
    queryFn: async () => {
      if (!activeClientId) return null;
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', activeClientId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!activeClientId,
  });

  // Fetch leads data for follow-up information
  const { data: leads } = useQuery({
    queryKey: ['client-leads', activeClientId],
    queryFn: async () => {
      if (!activeClientId || !client) return [];
      
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('name', client.name)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeClientId && !!client,
  });

  // Update client notes mutation
  const updateNotesMutation = useMutation({
    mutationFn: async (newNotes: string) => {
      if (!activeClientId) throw new Error('No client ID');
      
      const { error } = await supabase
        .from('clients')
        .update({ operator_notes: newNotes })
        .eq('id', activeClientId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', activeClientId] });
      toast.success('Notes updated successfully');
      setIsEditingNotes(false);
    },
    onError: (error) => {
      toast.error('Failed to update notes: ' + error.message);
    },
  });

  // Update follow-up mutation
  const updateFollowupMutation = useMutation({
    mutationFn: async (followupDate: string) => {
      if (!activeClientId || !client || !leads?.[0]) throw new Error('Missing data');
      
      const { error } = await supabase
        .from('leads')
        .update({ 
          follow_up_date: followupDate,
          follow_up_notes: `Follow-up scheduled for ${new Date(followupDate).toLocaleDateString()}`
        })
        .eq('id', leads[0].id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-leads', activeClientId] });
      toast.success('Follow-up date updated successfully');
      setIsEditingFollowup(false);
    },
    onError: (error) => {
      toast.error('Failed to update follow-up: ' + error.message);
    },
  });

  const handleNotesEdit = () => {
    setEditedNotes(client?.operator_notes || '');
    setIsEditingNotes(true);
  };

  const handleNotesSave = () => {
    updateNotesMutation.mutate(editedNotes);
  };

  const handleFollowupEdit = () => {
    const currentLead = leads?.[0];
    setEditedFollowupDate(currentLead?.follow_up_date || '');
    setIsEditingFollowup(true);
  };

  const handleFollowupSave = () => {
    updateFollowupMutation.mutate(editedFollowupDate);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">Loading communication details...</div>
        </CardContent>
      </Card>
    );
  }

  if (!client) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Purpose & Communication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            Select a client to view communication details
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentLead = leads?.[0];
  const followupDate = currentLead?.follow_up_date;
  const hasFollowup = followupDate && new Date(followupDate) > new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-600" />
          Purpose & Communication
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-600">Purpose of Buying</label>
          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 ml-2">
            {client.buying_purpose || 'Not specified'}
          </Badge>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-600">Contact Details</label>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-gray-400" />
              <span>{client.phone || 'Not provided'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-gray-400" />
              <span>{client.email || 'Not provided'}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-600">Operator Notes</label>
            <PermissionGate permissions={["MANAGE_CLIENTS"]} showFallback={false}>
              {!isEditingNotes && (
                <Button size="sm" variant="ghost" onClick={handleNotesEdit}>
                  <Edit className="h-3 w-3" />
                </Button>
              )}
            </PermissionGate>
          </div>
          {isEditingNotes ? (
            <div className="space-y-2 mt-1">
              <Textarea
                value={editedNotes}
                onChange={(e) => setEditedNotes(e.target.value)}
                placeholder="Add operator notes..."
                className="min-h-[80px]"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleNotesSave} disabled={updateNotesMutation.isPending}>
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditingNotes(false)}>
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 p-3 rounded-lg mt-1">
              <p className="text-sm">
                {client.operator_notes || 'No notes added yet. Click edit to add notes.'}
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-600">Next Follow-up</label>
            <PermissionGate permissions={["MANAGE_CLIENTS"]} showFallback={false}>
              {!isEditingFollowup && (
                <Button size="sm" variant="ghost" onClick={handleFollowupEdit}>
                  <Edit className="h-3 w-3" />
                </Button>
              )}
            </PermissionGate>
          </div>
          {isEditingFollowup ? (
            <div className="space-y-2 mt-1">
              <Input
                type="date"
                value={editedFollowupDate}
                onChange={(e) => setEditedFollowupDate(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleFollowupSave} disabled={updateFollowupMutation.isPending}>
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsEditingFollowup(false)}>
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4 text-gray-400" />
              {followupDate ? (
                <>
                  <span className="text-sm">{new Date(followupDate).toLocaleDateString()}</span>
                  <Badge variant="outline" className={`${hasFollowup ? 'text-orange-600 border-orange-200 bg-orange-50' : 'text-gray-500 border-gray-200 bg-gray-50'}`}>
                    {hasFollowup ? 'Alert Set' : 'Past Due'}
                  </Badge>
                </>
              ) : (
                <span className="text-sm text-gray-500">No follow-up scheduled</span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <PermissionGate permissions={["MANAGE_CLIENTS"]} showFallback={false}>
            <Button size="sm" variant="outline" onClick={handleNotesEdit}>
              <MessageCircle className="h-4 w-4 mr-1" />
              Add Note
            </Button>
          </PermissionGate>
          <Button size="sm" variant="outline">
            Communication Log
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
