-- Baseline Migration: Current Database Schema
-- Generated: 2026-01-28 13:30:00
-- Source: Supabase SQL export after administrative migration history reset
-- 
-- This migration recreates the exact state of the database as it exists.
-- All tables listed here already exist - this is documentation only.
-- DO NOT apply this migration to the existing database.
-- This serves as the baseline for migration history tracking.
--
-- Source Files:
-- - Query 1 (columns): Supabase Snippet Reset schema migrations.csv
-- - Query 2 (RLS): Supabase Snippet Reset schema migrations (1).csv  
-- - Query 3 (policies): Supabase Snippet Reset schema migrations (2).csv

-- =============================================================================
-- TABLE: users
-- =============================================================================
-- Source: Query 1, rows with table_name='users'
-- RLS: Query 2, users,false
CREATE TABLE IF NOT EXISTS users (
  -- Query 1: users,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: users,email,character varying,NO,null
  email VARCHAR NOT NULL UNIQUE,
  -- Query 1: users,password_hash,text,NO,null
  password_hash TEXT NOT NULL,
  -- Query 1: users,is_active,boolean,YES,false
  is_active BOOLEAN DEFAULT false,
  -- Query 1: users,full_name,character varying,YES,null
  full_name VARCHAR,
  -- Query 1: users,avatar_url,text,YES,null
  avatar_url TEXT,
  -- Query 1: users,role,character varying,NO,'user'::character varying
  role VARCHAR NOT NULL DEFAULT 'user',
  -- Query 1: users,created_at,timestamp with time zone,NO,now()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: users,updated_at,timestamp with time zone,NO,now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: users,last_login_at,timestamp with time zone,YES,null
  last_login_at TIMESTAMPTZ,
  -- Query 1: users,invited_by,uuid,YES,null
  invited_by UUID,
  -- Query 1: users,username,character varying,YES,null
  username VARCHAR
);
-- Query 2: users,rowsecurity=false (RLS NOT enabled)

-- =============================================================================
-- TABLE: modules
-- =============================================================================
-- Source: Query 1, rows with table_name='modules'
-- RLS: Query 2, modules,false
CREATE TABLE IF NOT EXISTS modules (
  -- Query 1: modules,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: modules,code,character varying,NO,null
  code VARCHAR NOT NULL UNIQUE,
  -- Query 1: modules,name,character varying,NO,null
  name VARCHAR NOT NULL,
  -- Query 1: modules,description,text,YES,null
  description TEXT,
  -- Query 1: modules,route,character varying,NO,null
  route VARCHAR NOT NULL,
  -- Query 1: modules,icon,character varying,YES,null
  icon VARCHAR,
  -- Query 1: modules,is_active,boolean,YES,true
  is_active BOOLEAN DEFAULT true,
  -- Query 1: modules,is_default,boolean,YES,false
  is_default BOOLEAN DEFAULT false,
  -- Query 1: modules,display_order,integer,YES,0
  display_order INTEGER DEFAULT 0,
  -- Query 1: modules,created_at,timestamp with time zone,NO,now()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: modules,updated_at,timestamp with time zone,NO,now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Query 2: modules,rowsecurity=false (RLS NOT enabled)

-- =============================================================================
-- TABLE: user_modules
-- =============================================================================
-- Source: Query 1, rows with table_name='user_modules'
-- RLS: Query 2, user_modules,false
CREATE TABLE IF NOT EXISTS user_modules (
  -- Query 1: user_modules,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: user_modules,user_id,uuid,NO,null
  user_id UUID NOT NULL,
  -- Query 1: user_modules,module_id,uuid,NO,null
  module_id UUID NOT NULL,
  -- Query 1: user_modules,is_enabled,boolean,YES,true
  is_enabled BOOLEAN DEFAULT true,
  -- Query 1: user_modules,granted_at,timestamp with time zone,NO,now()
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: user_modules,granted_by,uuid,YES,null
  granted_by UUID,
  UNIQUE(user_id, module_id)
);
-- Query 2: user_modules,rowsecurity=false (RLS NOT enabled)

-- =============================================================================
-- TABLE: form_mappings
-- =============================================================================
-- Source: Query 1, rows with table_name='form_mappings'
-- RLS: Query 2, form_mappings,false
CREATE TABLE IF NOT EXISTS form_mappings (
  -- Query 1: form_mappings,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: form_mappings,form_id,character varying,NO,null
  form_id VARCHAR NOT NULL,
  -- Query 1: form_mappings,name,character varying,NO,null
  name VARCHAR NOT NULL,
  -- Query 1: form_mappings,field_mapping,jsonb,NO,'{}'::jsonb
  field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Query 1: form_mappings,value_mapping,jsonb,NO,'{}'::jsonb
  value_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Query 1: form_mappings,workflow,jsonb,NO,'[]'::jsonb
  workflow JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Query 1: form_mappings,html_card,text,YES,null
  html_card TEXT,
  -- Query 1: form_mappings,version,integer,NO,1
  version INTEGER NOT NULL DEFAULT 1,
  -- Query 1: form_mappings,created_at,timestamp with time zone,NO,now()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: form_mappings,updated_at,timestamp with time zone,NO,now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: form_mappings,deleted_at,timestamp with time zone,YES,null
  deleted_at TIMESTAMPTZ,
  -- Query 1: form_mappings,created_by,uuid,YES,null
  created_by UUID,
  -- Query 1: form_mappings,updated_by,uuid,YES,null
  updated_by UUID
);
-- Query 2: form_mappings,rowsecurity=false (RLS NOT enabled)

-- =============================================================================
-- TABLE: form_mappings_history
-- =============================================================================
-- Source: Query 1, rows with table_name='form_mappings_history'
-- RLS: Query 2, form_mappings_history,false
CREATE TABLE IF NOT EXISTS form_mappings_history (
  -- Query 1: form_mappings_history,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: form_mappings_history,mapping_id,uuid,NO,null
  mapping_id UUID NOT NULL,
  -- Query 1: form_mappings_history,form_id,character varying,NO,null
  form_id VARCHAR NOT NULL,
  -- Query 1: form_mappings_history,name,character varying,NO,null
  name VARCHAR NOT NULL,
  -- Query 1: form_mappings_history,field_mapping,jsonb,NO,null
  field_mapping JSONB NOT NULL,
  -- Query 1: form_mappings_history,value_mapping,jsonb,NO,null
  value_mapping JSONB NOT NULL,
  -- Query 1: form_mappings_history,workflow,jsonb,NO,null
  workflow JSONB NOT NULL,
  -- Query 1: form_mappings_history,html_card,text,YES,null
  html_card TEXT,
  -- Query 1: form_mappings_history,version,integer,NO,null
  version INTEGER NOT NULL,
  -- Query 1: form_mappings_history,changed_at,timestamp with time zone,NO,now()
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: form_mappings_history,changed_by,uuid,YES,null
  changed_by UUID,
  -- Query 1: form_mappings_history,change_type,character varying,NO,null
  change_type VARCHAR NOT NULL
);
-- Query 2: form_mappings_history,rowsecurity=false (RLS NOT enabled)

-- =============================================================================
-- TABLE: form_submissions_log
-- =============================================================================
-- Source: Query 1, rows with table_name='form_submissions_log'
-- RLS: Query 2, form_submissions_log,false
CREATE TABLE IF NOT EXISTS form_submissions_log (
  -- Query 1: form_submissions_log,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: form_submissions_log,form_id,character varying,NO,null
  form_id VARCHAR NOT NULL,
  -- Query 1: form_submissions_log,entry_id,character varying,YES,null
  entry_id VARCHAR,
  -- Query 1: form_submissions_log,submission_data,jsonb,NO,null
  submission_data JSONB NOT NULL,
  -- Query 1: form_submissions_log,processed_data,jsonb,YES,null
  processed_data JSONB,
  -- Query 1: form_submissions_log,status,character varying,NO,'pending'::character varying
  status VARCHAR NOT NULL DEFAULT 'pending',
  -- Query 1: form_submissions_log,error_message,text,YES,null
  error_message TEXT,
  -- Query 1: form_submissions_log,odoo_record_id,integer,YES,null
  odoo_record_id INTEGER,
  -- Query 1: form_submissions_log,odoo_model,character varying,YES,null
  odoo_model VARCHAR,
  -- Query 1: form_submissions_log,submitted_at,timestamp with time zone,NO,now()
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: form_submissions_log,processed_at,timestamp with time zone,YES,null
  processed_at TIMESTAMPTZ,
  -- Query 1: form_submissions_log,processing_time_ms,integer,YES,null
  processing_time_ms INTEGER,
  -- Query 1: form_submissions_log,retry_count,integer,NO,0
  retry_count INTEGER NOT NULL DEFAULT 0,
  -- Query 1: form_submissions_log,metadata,jsonb,YES,'{}'::jsonb
  metadata JSONB DEFAULT '{}'::jsonb
);
-- Query 2: form_submissions_log,rowsecurity=false (RLS NOT enabled)

-- =============================================================================
-- TABLE: invites
-- =============================================================================
-- Source: Query 1, rows with table_name='invites'
-- RLS: Query 2, invites,false
CREATE TABLE IF NOT EXISTS invites (
  -- Query 1: invites,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: invites,email,character varying,NO,null
  email VARCHAR NOT NULL,
  -- Query 1: invites,token,character varying,NO,null
  token VARCHAR NOT NULL UNIQUE,
  -- Query 1: invites,expires_at,timestamp with time zone,NO,null
  expires_at TIMESTAMPTZ NOT NULL,
  -- Query 1: invites,created_at,timestamp with time zone,NO,now()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: invites,created_by,uuid,NO,null
  created_by UUID NOT NULL,
  -- Query 1: invites,accepted_at,timestamp with time zone,YES,null
  accepted_at TIMESTAMPTZ,
  -- Query 1: invites,accepted_by,uuid,YES,null
  accepted_by UUID
);
-- Query 2: invites,rowsecurity=false (RLS NOT enabled)

-- =============================================================================
-- TABLE: sessions
-- =============================================================================
-- Source: Query 1, rows with table_name='sessions'
-- RLS: Query 2, sessions,false
CREATE TABLE IF NOT EXISTS sessions (
  -- Query 1: sessions,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: sessions,user_id,uuid,NO,null
  user_id UUID NOT NULL,
  -- Query 1: sessions,token,character varying,NO,null
  token VARCHAR NOT NULL UNIQUE,
  -- Query 1: sessions,user_agent,text,YES,null
  user_agent TEXT,
  -- Query 1: sessions,ip_address,inet,YES,null
  ip_address INET,
  -- Query 1: sessions,expires_at,timestamp with time zone,NO,null
  expires_at TIMESTAMPTZ NOT NULL,
  -- Query 1: sessions,created_at,timestamp with time zone,NO,now()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: sessions,last_activity_at,timestamp with time zone,NO,now()
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Query 2: sessions,rowsecurity=false (RLS NOT enabled)

-- =============================================================================
-- TABLE: roles
-- =============================================================================
-- Source: Query 1, rows with table_name='roles'
-- RLS: Query 2, roles,true
CREATE TABLE IF NOT EXISTS roles (
  -- Query 1: roles,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: roles,key,text,NO,null
  key TEXT NOT NULL UNIQUE,
  -- Query 1: roles,name,text,NO,null
  name TEXT NOT NULL,
  -- Query 1: roles,created_at,timestamp with time zone,NO,now()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query 2: roles,rowsecurity=true
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Query 3: public,roles,Authenticated users can read roles,PERMISSIVE,{public},SELECT,(auth.role() = 'authenticated'::text),null
CREATE POLICY "Authenticated users can read roles"
  ON roles FOR SELECT
  TO public
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- TABLE: user_profiles
-- =============================================================================
-- Source: Query 1, rows with table_name='user_profiles'
-- RLS: Query 2, user_profiles,true
CREATE TABLE IF NOT EXISTS user_profiles (
  -- Query 1: user_profiles,id,uuid,NO,null
  id UUID PRIMARY KEY,
  -- Query 1: user_profiles,email,text,NO,null
  email TEXT NOT NULL,
  -- Query 1: user_profiles,created_at,timestamp with time zone,NO,now()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query 2: user_profiles,rowsecurity=true
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Query 3: public,user_profiles,Users can read own profile,PERMISSIVE,{public},SELECT,(auth.uid() = id),null
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  TO public
  USING (auth.uid() = id);

-- Query 3: public,user_profiles,Admins can read all profiles,PERMISSIVE,{public},ALL,(EXISTS ( SELECT 1 FROM (user_roles ur JOIN roles r ON ((r.id = ur.role_id))) WHERE ((ur.user_id = auth.uid()) AND (r.key = 'admin'::text)))),null
CREATE POLICY "Admins can read all profiles"
  ON user_profiles FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.key = 'admin'
    )
  );

-- =============================================================================
-- TABLE: user_roles
-- =============================================================================
-- Source: Query 1, rows with table_name='user_roles'
-- RLS: Query 2, user_roles,true
CREATE TABLE IF NOT EXISTS user_roles (
  -- Query 1: user_roles,user_id,uuid,NO,null
  user_id UUID NOT NULL,
  -- Query 1: user_roles,role_id,uuid,NO,null
  role_id UUID NOT NULL,
  -- Query 1: user_roles,created_at,timestamp with time zone,NO,now()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- Query 2: user_roles,rowsecurity=true
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Query 3: public,user_roles,Users can read own roles,PERMISSIVE,{public},SELECT,(auth.uid() = user_id),null
CREATE POLICY "Users can read own roles"
  ON user_roles FOR SELECT
  TO public
  USING (auth.uid() = user_id);

-- Query 3: public,user_roles,Admins can manage all roles,PERMISSIVE,{public},ALL,(EXISTS ( SELECT 1 FROM (user_roles ur JOIN roles r ON ((r.id = ur.role_id))) WHERE ((ur.user_id = auth.uid()) AND (r.key = 'admin'::text)))),null
CREATE POLICY "Admins can manage all roles"
  ON user_roles FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.key = 'admin'
    )
  );

-- =============================================================================
-- TABLE: sales_insight_queries
-- =============================================================================
-- Source: Query 1, rows with table_name='sales_insight_queries'
-- RLS: Query 2, sales_insight_queries,true
CREATE TABLE IF NOT EXISTS sales_insight_queries (
  -- Query 1: sales_insight_queries,id,uuid,NO,gen_random_uuid()
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Query 1: sales_insight_queries,name,text,NO,null
  name TEXT NOT NULL,
  -- Query 1: sales_insight_queries,description,text,YES,null
  description TEXT,
  -- Query 1: sales_insight_queries,base_model,text,NO,null
  base_model TEXT NOT NULL,
  -- Query 1: sales_insight_queries,query_definition,jsonb,NO,null
  query_definition JSONB NOT NULL,
  -- Query 1: sales_insight_queries,source,text,NO,null
  source TEXT NOT NULL,
  -- Query 1: sales_insight_queries,complexity_hint,text,YES,null
  complexity_hint TEXT,
  -- Query 1: sales_insight_queries,created_at,timestamp with time zone,NO,now()
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Query 1: sales_insight_queries,updated_at,timestamp with time zone,NO,now()
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query 2: sales_insight_queries,rowsecurity=true
ALTER TABLE sales_insight_queries ENABLE ROW LEVEL SECURITY;

-- Query 3: public,sales_insight_queries,Allow authenticated read access,PERMISSIVE,{authenticated},SELECT,true,null
CREATE POLICY "Allow authenticated read access"
  ON sales_insight_queries FOR SELECT
  TO authenticated
  USING (true);

-- Query 3: public,sales_insight_queries,Allow authenticated insert access,PERMISSIVE,{authenticated},INSERT,null,true
CREATE POLICY "Allow authenticated insert access"
  ON sales_insight_queries FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Query 3: public,sales_insight_queries,Allow authenticated update access,PERMISSIVE,{authenticated},UPDATE,true,true
CREATE POLICY "Allow authenticated update access"
  ON sales_insight_queries FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Query 3: public,sales_insight_queries,Allow authenticated delete access,PERMISSIVE,{authenticated},DELETE,true,null
CREATE POLICY "Allow authenticated delete access"
  ON sales_insight_queries FOR DELETE
  TO authenticated
  USING (true);

-- =============================================================================
-- VIEWS (documentation only - not recreated in this baseline)
-- =============================================================================
-- - active_invites_view
-- - user_modules_view
-- 
-- These views are derived from base tables and are not included in this
-- baseline migration. They will be recreated by triggers or future migrations.

-- =============================================================================
-- BASELINE COMPLETE
-- =============================================================================
-- This migration documents the schema state as of 2026-01-28 after
-- administrative migration history reset. All tables already exist.
