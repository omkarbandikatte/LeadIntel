-- ============================================================================
-- AI-Based B2B Lead Intelligence & Conversion Prediction System
-- Database Schema (PostgreSQL) — companion to 01_TECHNICAL_ARCHITECTURE.md
-- Free/open-source: designed to run on a self-hosted or free-tier PostgreSQL.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- required by idx_companies_name's gin_trgm_ops below

-- ----------------------------------------------------------------------------
-- USERS & ACCESS CONTROL
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,      -- passlib bcrypt hash, no external auth provider
    full_name       VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('bd_executive', 'manager', 'admin')),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- COMPANIES (core entity)
-- ----------------------------------------------------------------------------
CREATE TABLE companies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(500) NOT NULL,
    website             VARCHAR(500),
    industry            VARCHAR(255),
    employee_count_band VARCHAR(50),          -- e.g. '1-10','11-50','51-200','201-1000','1000+'
    revenue_band        VARCHAR(50),
    location_city       VARCHAR(255),
    location_state      VARCHAR(255),
    location_country    VARCHAR(255) DEFAULT 'India',
    incorporation_date  DATE,
    source              VARCHAR(100),          -- e.g. 'mca_filing','linkedin_public','manual_upload'
    enrichment_status   VARCHAR(20) DEFAULT 'pending' CHECK (enrichment_status IN ('pending','enriched','failed')),
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_companies_industry ON companies(industry);
CREATE INDEX idx_companies_name ON companies USING gin (name gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- RAW SCRAPED DOCUMENTS (job postings, company text, news mentions)
-- ----------------------------------------------------------------------------
CREATE TABLE raw_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
    doc_type        VARCHAR(50) NOT NULL CHECK (doc_type IN ('job_posting','company_about','news_mention','press_release')),
    source_url      VARCHAR(1000),
    raw_text        TEXT,
    content_hash    VARCHAR(64) NOT NULL,       -- sha256 for dedupe on re-scrape
    scraped_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(content_hash)
);

CREATE INDEX idx_raw_documents_company ON raw_documents(company_id);

-- ----------------------------------------------------------------------------
-- NLP-DERIVED FEATURES (output of the NLP processing service)
-- ----------------------------------------------------------------------------
CREATE TABLE nlp_features (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id              UUID REFERENCES companies(id) ON DELETE CASCADE,
    raw_document_id         UUID REFERENCES raw_documents(id) ON DELETE CASCADE,
    predicted_need_category VARCHAR(50) CHECK (predicted_need_category IN ('branding','hiring','learning_development','iac_partnership')),
    confidence              NUMERIC(5,4),        -- 0.0000–1.0000
    extracted_entities      JSONB,                -- role titles, departments, keywords found
    processed_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nlp_features_company ON nlp_features(company_id);

-- ----------------------------------------------------------------------------
-- CRM HISTORICAL OUTCOMES (ground truth for model training)
-- ----------------------------------------------------------------------------
CREATE TABLE crm_deals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    deal_stage      VARCHAR(50),                 -- e.g. 'prospect','contacted','proposal','closed_won','closed_lost'
    service_line    VARCHAR(50) CHECK (service_line IN ('branding','hiring','learning_development','iac_partnership')),
    deal_value      NUMERIC(14,2),
    outcome         VARCHAR(20) CHECK (outcome IN ('won','lost','open')),
    closed_at       TIMESTAMPTZ,
    owner_user_id   UUID REFERENCES users(id),
    imported_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_deals_company ON crm_deals(company_id);
CREATE INDEX idx_crm_deals_outcome ON crm_deals(outcome);

-- ----------------------------------------------------------------------------
-- LEAD SCORES (output of the scoring service — one row per scoring run)
-- ----------------------------------------------------------------------------
CREATE TABLE lead_scores (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id              UUID REFERENCES companies(id) ON DELETE CASCADE,
    fit_score               NUMERIC(5,2),         -- 0–100
    intent_score            NUMERIC(5,2),         -- 0–100
    conversion_probability  NUMERIC(5,2) NOT NULL,-- 0–100, combined score
    recommended_service     VARCHAR(50) CHECK (recommended_service IN ('branding','hiring','learning_development','iac_partnership')),
    recommendation_confidence NUMERIC(5,4),
    top_factors             JSONB,                -- e.g. [{"factor":"hiring surge","weight":0.32}, ...]
    model_version           VARCHAR(50),           -- e.g. 'rules_v1','xgb_v2_2026-08'
    scored_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lead_scores_company ON lead_scores(company_id);
CREATE INDEX idx_lead_scores_probability ON lead_scores(conversion_probability DESC);

-- ----------------------------------------------------------------------------
-- BD FEEDBACK (feeds the retraining loop)
-- ----------------------------------------------------------------------------
CREATE TABLE feedback (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_score_id   UUID REFERENCES lead_scores(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id),
    is_accurate     BOOLEAN NOT NULL,
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- CRM SYNC LOG (audit trail for two-way sync jobs)
-- ----------------------------------------------------------------------------
CREATE TABLE crm_sync_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    direction       VARCHAR(10) CHECK (direction IN ('push','pull')),
    record_count    INTEGER,
    status          VARCHAR(20) CHECK (status IN ('success','failed','partial')),
    error_detail    TEXT,
    run_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- Notes:
-- 1. UUIDs used throughout for portability if data is ever migrated/merged.
-- 2. JSONB columns (extracted_entities, top_factors) avoid premature schema
--    rigidity for fields that will evolve during model iteration.
-- 3. content_hash on raw_documents is the dedupe mechanism referenced in
--    01_TECHNICAL_ARCHITECTURE.md's "idempotent scraping" requirement.
-- 4. No column here stores third-party API keys or tokens — none are needed.
-- ============================================================================
