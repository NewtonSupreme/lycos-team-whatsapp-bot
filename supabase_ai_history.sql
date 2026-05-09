-- Historial de Conversaciones IA
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sede_id UUID REFERENCES sedes(id),
  user_id UUID REFERENCES usuarios(id),
  titulo TEXT DEFAULT 'Nueva conversación',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on ai_conversations" ON ai_conversations FOR SELECT USING (true);
CREATE POLICY "Allow public insert on ai_conversations" ON ai_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on ai_conversations" ON ai_conversations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on ai_conversations" ON ai_conversations FOR DELETE USING (true);

CREATE POLICY "Allow public select on ai_messages" ON ai_messages FOR SELECT USING (true);
CREATE POLICY "Allow public insert on ai_messages" ON ai_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete on ai_messages" ON ai_messages FOR DELETE USING (true);
