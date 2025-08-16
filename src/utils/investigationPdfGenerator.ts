import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface InvestigationPdfData {
  investigation: any;
  steps: any[];
  updates: any[];
  bankAccount: any;
}

export const generateInvestigationReportPDF = async ({ 
  investigation, 
  steps, 
  updates, 
  bankAccount 
}: InvestigationPdfData) => {
  const doc = new jsPDF();
  
  // Set font
  doc.setFont('helvetica');
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(40, 40, 40);
  doc.text('INVESTIGATION REPORT', 105, 20, { align: 'center' });
  
  // Investigation summary box
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Investigation Summary', 20, 35);
  
  doc.rect(15, 40, 180, 45);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Basic investigation details
  let yPos = 50;
  doc.text(`Investigation Type: ${investigation.investigation_type}`, 20, yPos);
  doc.text(`Priority: ${investigation.priority}`, 20, yPos + 7);
  doc.text(`Status: ${investigation.status}`, 20, yPos + 14);
  doc.text(`Created: ${format(new Date(investigation.created_at), 'dd/MM/yyyy')}`, 20, yPos + 21);
  
  if (investigation.resolved_at) {
    doc.text(`Resolved: ${format(new Date(investigation.resolved_at), 'dd/MM/yyyy')}`, 20, yPos + 28);
  }
  
  // Bank account details
  if (bankAccount) {
    doc.text(`Bank: ${bankAccount.bank_name}`, 110, yPos);
    doc.text(`Account: ${bankAccount.account_name}`, 110, yPos + 7);
    doc.text(`A/C No: ${bankAccount.account_number}`, 110, yPos + 14);
  }
  
  // Reason
  yPos = 95;
  doc.setFont('helvetica', 'bold');
  doc.text('Reason:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  const reasonLines = doc.splitTextToSize(investigation.reason || 'Not specified', 170);
  yPos += 7;
  reasonLines.forEach((line: string) => {
    doc.text(line, 20, yPos);
    yPos += 5;
  });
  
  // Investigation Steps
  yPos += 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Investigation Process Steps', 20, yPos);
  
  if (steps && steps.length > 0) {
    yPos += 10;
    
    const stepsTableData = steps.map((step, index) => [
      (index + 1).toString(),
      step.step_title,
      step.status,
      step.completed_at ? format(new Date(step.completed_at), 'dd/MM/yyyy') : 'Pending',
      step.completed_by || 'N/A'
    ]);
    
    autoTable(doc, {
      head: [['#', 'Step Title', 'Status', 'Completed Date', 'Completed By']],
      body: stepsTableData,
      startY: yPos,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 60 },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
        4: { cellWidth: 50 },
      },
    });
    
    yPos = (doc as any).lastAutoTable?.finalY || yPos + 50;
  }
  
  // Investigation Timeline & Updates
  yPos += 15;
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Investigation Timeline & Updates', 20, yPos);
  
  if (updates && updates.length > 0) {
    yPos += 10;
    
    for (const update of updates) {
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }
      
      // Update header
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${format(new Date(update.created_at), 'dd/MM/yyyy HH:mm')} - ${update.created_by || 'System'}`, 20, yPos);
      
      // Update content
      doc.setFont('helvetica', 'normal');
      const updateLines = doc.splitTextToSize(update.update_text, 170);
      yPos += 7;
      updateLines.forEach((line: string) => {
        if (yPos > 280) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, 20, yPos);
        yPos += 5;
      });
      
      // Attachments
      if (update.attachment_urls && update.attachment_urls.length > 0) {
        doc.setFont('helvetica', 'italic');
        doc.text(`Attachments: ${update.attachment_urls.length} file(s)`, 20, yPos);
        yPos += 5;
        
        update.attachment_urls.forEach((url: string, index: number) => {
          const fileName = url.split('/').pop() || `attachment_${index + 1}`;
          doc.text(`- ${fileName}`, 25, yPos);
          yPos += 4;
        });
      }
      
      yPos += 5; // Space between updates
    }
  }
  
  // Resolution notes
  if (investigation.resolution_notes) {
    yPos += 10;
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Resolution Notes', 20, yPos);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const resolutionLines = doc.splitTextToSize(investigation.resolution_notes, 170);
    yPos += 10;
    resolutionLines.forEach((line: string) => {
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(line, 20, yPos);
      yPos += 5;
    });
  }
  
  // Footer on last page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Investigation Report - Page ${i} of ${pageCount} - Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 
      105, 
      290, 
      { align: 'center' }
    );
  }
  
  return doc;
};

// Function to handle PDF generation with file merging
export const generateCompleteInvestigationPDF = async (investigation: any) => {
  try {
    // Fetch all related data
    const [stepsResult, updatesResult, bankAccountResult] = await Promise.all([
      supabase
        .from('investigation_steps')
        .select('*')
        .eq('investigation_id', investigation.id)
        .order('step_number'),
      
      supabase
        .from('investigation_updates')
        .select('*')
        .eq('investigation_id', investigation.id)
        .order('created_at'),
      
      investigation.bank_account_id ? 
        supabase
          .from('bank_accounts')
          .select('*')
          .eq('id', investigation.bank_account_id)
          .single() : 
        Promise.resolve({ data: null })
    ]);
    
    const steps = stepsResult.data || [];
    const updates = updatesResult.data || [];
    const bankAccount = bankAccountResult.data;
    
    // Generate the main PDF
    const mainDoc = await generateInvestigationReportPDF({
      investigation,
      steps,
      updates,
      bankAccount
    });
    
    // Collect all attachment URLs
    const allAttachments: string[] = [];
    
    // From investigation steps
    steps.forEach(step => {
      if (step.completion_report_url) {
        allAttachments.push(step.completion_report_url);
      }
    });
    
    // From updates
    updates.forEach(update => {
      if (update.attachment_urls) {
        allAttachments.push(...update.attachment_urls);
      }
    });
    
    // If there are attachments, add a separator page and note about attachments
    if (allAttachments.length > 0) {
      mainDoc.addPage();
      mainDoc.setFontSize(16);
      mainDoc.setFont('helvetica', 'bold');
      mainDoc.text('ATTACHED DOCUMENTS', 105, 50, { align: 'center' });
      
      mainDoc.setFontSize(12);
      mainDoc.setFont('helvetica', 'normal');
      mainDoc.text('The following documents were attached to this investigation:', 20, 80);
      
      let yPos = 100;
      allAttachments.forEach((url, index) => {
        const fileName = url.split('/').pop() || `Document ${index + 1}`;
        mainDoc.text(`${index + 1}. ${fileName}`, 25, yPos);
        yPos += 10;
      });
      
      mainDoc.setFontSize(10);
      mainDoc.setTextColor(100, 100, 100);
      mainDoc.text('Note: Individual document files would need to be downloaded separately', 20, yPos + 20);
    }
    
    return mainDoc;
    
  } catch (error) {
    console.error('Error generating investigation PDF:', error);
    throw error;
  }
};