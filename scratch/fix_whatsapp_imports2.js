const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/dashboard/whatsapp/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

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

const QUICK_REPLIES = [
  '¡Hola! ¿En qué le puedo ayudar? 😊',
  'Su vehículo está listo para retirar. 🔧',
  'Le informamos que su servicio está en proceso.',
  '¿Podría indicarnos su marca/modelo y año?',
  'Tenemos disponibilidad mañana. 📅',
  'Le envío los precios en un momento. 💰',
];

interface RawMsg {`;

// Find where interface RawMsg starts
const interfaceIndex = content.indexOf('interface RawMsg {');
if (interfaceIndex !== -1) {
  content = correctHeader + content.substring(interfaceIndex + 'interface RawMsg {'.length);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed whatsapp page completely');
