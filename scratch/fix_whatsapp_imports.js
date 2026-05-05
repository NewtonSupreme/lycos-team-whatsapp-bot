const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/dashboard/whatsapp/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find where QUICK_REPLIES starts
const quickRepliesIndex = content.indexOf('const QUICK_REPLIES = [');

// The fixed header
const correctHeader = `'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare, Send, Bot, User,
  Smile, CheckCheck, Check, X, RefreshCw, UserCheck, Wifi, WifiOff, Search, Clock,
  Image as ImageIcon, Video, Volume2, FileText, ChevronDown, Car, Calendar, Hash, Info,
  Copy, Trash, Zap, Paperclip, Mic, UserPlus, Trash2, RotateCcw
} from 'lucide-react';
import { supabase, syncClientData } from '@/lib/supabase';
import { Vehiculo } from '@/types';
import { cn, formatRelativeTime } from '@/lib/utils';
import { withSedeFilter, withSedeInsert } from '@/lib/db-filters';
import { useSedeStore } from '@/lib/store/useSedeStore';

`;

content = correctHeader + content.substring(quickRepliesIndex);

// Add the missing closing </div> for the whatsapp page blur wrapper at the bottom
// Before the closing `  ); \n}`
content = content.replace(/      <\/div>\r?\n    <\/div>\r?\n  \);\r?\n}\r?\n*$/, '      </div>\n    </div>\n    </div>\n  );\n}\n');


fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed whatsapp page');
