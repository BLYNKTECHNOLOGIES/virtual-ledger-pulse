
-- Add RLS policies for warehouse_stock_movements table to allow inserts
CREATE POLICY "Allow insert warehouse stock movements" 
  ON public.warehouse_stock_movements 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow select warehouse stock movements" 
  ON public.warehouse_stock_movements 
  FOR SELECT 
  USING (true);

CREATE POLICY "Allow update warehouse stock movements" 
  ON public.warehouse_stock_movements 
  FOR UPDATE 
  USING (true);

CREATE POLICY "Allow delete warehouse stock movements" 
  ON public.warehouse_stock_movements 
  FOR DELETE 
  USING (true);
