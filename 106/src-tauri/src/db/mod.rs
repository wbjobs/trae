use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use rusqlite::Connection as RusqliteConnection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;
use anyhow::Result;
use thiserror::Error;
use crate::emergency::{EmergencyContact, EmergencyConfig, RecoveryRequest};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("数据库连接失败: {0}")]
    ConnectionError(String),
    #[error("查询失败: {0}")]
    QueryError(String),
    #[error("加密密钥错误")]
    EncryptionKeyError,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PasswordEntry {
    pub id: String,
    pub title: String,
    pub username: String,
    pub encrypted_password: String,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub iv: String,
    pub tag: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NewPasswordEntry {
    pub title: String,
    pub username: String,
    pub encrypted_password: String,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub iv: String,
    pub tag: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbEmergencyContact {
    pub id: String,
    pub name: String,
    pub email: String,
    pub phone: Option<String>,
    pub share: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbEmergencyConfig {
    pub enabled: bool,
    pub threshold: i32,
    pub waiting_period_days: i64,
    pub master_key_hash: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbRecoveryRequest {
    pub id: String,
    pub contact_id: String,
    pub verification_code: String,
    pub requested_at: String,
    pub approved: bool,
}

pub struct Database {
    conn: SqliteConnection,
    db_path: PathBuf,
}

impl Database {
    pub fn new(db_path: PathBuf, encryption_key: &str) -> Result<Self> {
        let conn_str = db_path.to_str().unwrap_or("passwords.db");
        let rusqlite_conn = RusqliteConnection::open(conn_str)
            .map_err(|e| DatabaseError::ConnectionError(e.to_string()))?;

        rusqlite_conn
            .pragma_update(None, "key", encryption_key)
            .map_err(|e| DatabaseError::EncryptionKeyError)?;

        Self::ensure_emergency_tables(&rusqlite_conn)?;

        let mut conn = SqliteConnection::establish(conn_str)
            .map_err(|e| DatabaseError::ConnectionError(e.to_string()))?;

        conn.run_pending_migrations(MIGRATIONS)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(Self { conn, db_path })
    }

    pub fn init(db_path: PathBuf, encryption_key: &str) -> Result<Self> {
        let conn_str = db_path.to_str().unwrap_or("passwords.db");
        let rusqlite_conn = RusqliteConnection::open(conn_str)
            .map_err(|e| DatabaseError::ConnectionError(e.to_string()))?;

        rusqlite_conn
            .pragma_update(None, "key", encryption_key)
            .map_err(|e| DatabaseError::EncryptionKeyError)?;

        rusqlite_conn
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS passwords (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    username TEXT NOT NULL,
                    encrypted_password TEXT NOT NULL,
                    url TEXT,
                    notes TEXT,
                    category TEXT,
                    iv TEXT NOT NULL,
                    tag TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE TABLE IF NOT EXISTS vault_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_passwords_title ON passwords(title);
                CREATE INDEX IF NOT EXISTS idx_passwords_category ON passwords(category);"
            )
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Self::ensure_emergency_tables(&rusqlite_conn)?;

        let mut conn = SqliteConnection::establish(conn_str)
            .map_err(|e| DatabaseError::ConnectionError(e.to_string()))?;

        conn.run_pending_migrations(MIGRATIONS)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(Self { conn, db_path })
    }

    fn ensure_emergency_tables(conn: &RusqliteConnection) -> Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS emergency_contacts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT,
                share TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS emergency_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER NOT NULL DEFAULT 0,
                threshold INTEGER NOT NULL DEFAULT 2,
                waiting_period_days INTEGER NOT NULL DEFAULT 30,
                master_key_hash TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS recovery_requests (
                id TEXT PRIMARY KEY,
                contact_id TEXT NOT NULL,
                verification_code TEXT NOT NULL,
                requested_at TEXT NOT NULL,
                approved INTEGER NOT NULL DEFAULT 0
            );
            INSERT OR IGNORE INTO emergency_config (id, enabled, threshold, waiting_period_days) 
            VALUES (1, 0, 2, 30);"
        )
        .map_err(|e| DatabaseError::QueryError(e.to_string()))?;
        Ok(())
    }

    pub fn save_emergency_config(
        &mut self,
        config: &DbEmergencyConfig,
        contacts: &[DbEmergencyContact],
    ) -> Result<()> {
        use schema::emergency_config;
        use schema::emergency_contacts;

        let now = chrono::Utc::now().to_rfc3339();

        diesel::delete(emergency_contacts::table)
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        for contact in contacts {
            diesel::insert_into(emergency_contacts::table)
                .values((
                    emergency_contacts::id.eq(&contact.id),
                    emergency_contacts::name.eq(&contact.name),
                    emergency_contacts::email.eq(&contact.email),
                    emergency_contacts::phone.eq(&contact.phone),
                    emergency_contacts::share.eq(&contact.share),
                    emergency_contacts::created_at.eq(&contact.created_at),
                ))
                .execute(&mut self.conn)
                .map_err(|e| DatabaseError::QueryError(e.to_string()))?;
        }

        diesel::update(emergency_config::table.filter(emergency_config::id.eq(1)))
            .set((
                emergency_config::enabled.eq(config.enabled),
                emergency_config::threshold.eq(config.threshold),
                emergency_config::waiting_period_days.eq(config.waiting_period_days),
                emergency_config::master_key_hash.eq(&config.master_key_hash),
                emergency_config::updated_at.eq(&now),
            ))
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    pub fn get_emergency_config(&mut self) -> Result<Option<DbEmergencyConfig>> {
        use schema::emergency_config;

        let result = emergency_config::table
            .filter(emergency_config::id.eq(1))
            .first::<DbEmergencyConfigQuery>(&mut self.conn)
            .optional()
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(result.map(|c| DbEmergencyConfig {
            enabled: c.enabled != 0,
            threshold: c.threshold,
            waiting_period_days: c.waiting_period_days,
            master_key_hash: c.master_key_hash,
            created_at: c.created_at,
            updated_at: c.updated_at,
        }))
    }

    pub fn get_emergency_contacts(&mut self) -> Result<Vec<DbEmergencyContact>> {
        use schema::emergency_contacts;

        let results = emergency_contacts::table
            .order(emergency_contacts::created_at.asc())
            .load::<DbEmergencyContactQuery>(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(results
            .into_iter()
            .map(|c| DbEmergencyContact {
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                share: c.share,
                created_at: c.created_at,
            })
            .collect())
    }

    pub fn add_recovery_request(
        &mut self,
        contact_id: &str,
        verification_code: &str,
    ) -> Result<DbRecoveryRequest> {
        use schema::recovery_requests;

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        diesel::insert_into(recovery_requests::table)
            .values((
                recovery_requests::id.eq(&id),
                recovery_requests::contact_id.eq(contact_id),
                recovery_requests::verification_code.eq(verification_code),
                recovery_requests::requested_at.eq(&now),
                recovery_requests::approved.eq(0),
            ))
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(DbRecoveryRequest {
            id,
            contact_id: contact_id.to_string(),
            verification_code: verification_code.to_string(),
            requested_at: now,
            approved: false,
        })
    }

    pub fn get_recovery_requests(&mut self) -> Result<Vec<DbRecoveryRequest>> {
        use schema::recovery_requests;

        let results = recovery_requests::table
            .order(recovery_requests::requested_at.desc())
            .load::<DbRecoveryRequestQuery>(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(results
            .into_iter()
            .map(|r| DbRecoveryRequest {
                id: r.id,
                contact_id: r.contact_id,
                verification_code: r.verification_code,
                requested_at: r.requested_at,
                approved: r.approved != 0,
            })
            .collect())
    }

    pub fn approve_recovery_request(&mut self, request_id: &str) -> Result<()> {
        use schema::recovery_requests;

        diesel::update(recovery_requests::table.filter(recovery_requests::id.eq(request_id)))
            .set(recovery_requests::approved.eq(1))
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    pub fn clear_recovery_requests(&mut self) -> Result<()> {
        use schema::recovery_requests;

        diesel::delete(recovery_requests::table)
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    pub fn disable_emergency(&mut self) -> Result<()> {
        use schema::emergency_config;
        use schema::emergency_contacts;
        use schema::recovery_requests;

        diesel::delete(emergency_contacts::table)
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        diesel::delete(recovery_requests::table)
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        diesel::update(emergency_config::table.filter(emergency_config::id.eq(1)))
            .set(emergency_config::enabled.eq(0))
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    pub fn add_password(&mut self, entry: NewPasswordEntry) -> Result<PasswordEntry> {
        use schema::passwords;

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();

        let new_entry = DatabaseNewPassword {
            id: id.clone(),
            title: entry.title,
            username: entry.username,
            encrypted_password: entry.encrypted_password,
            url: entry.url,
            notes: entry.notes,
            category: entry.category,
            iv: entry.iv,
            tag: entry.tag,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        diesel::insert_into(passwords::table)
            .values(&new_entry)
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(PasswordEntry {
            id,
            title: new_entry.title,
            username: new_entry.username,
            encrypted_password: new_entry.encrypted_password,
            url: new_entry.url,
            notes: new_entry.notes,
            category: new_entry.category,
            created_at: now.clone(),
            updated_at: now,
            iv: new_entry.iv,
            tag: new_entry.tag,
        })
    }

    pub fn get_password(&mut self, id: &str) -> Result<Option<PasswordEntry>> {
        use schema::passwords;

        let result = passwords::table
            .filter(passwords::id.eq(id))
            .first::<DatabasePassword>(&mut self.conn)
            .optional()
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(result.map(|p| p.into()))
    }

    pub fn update_password(&mut self, id: &str, entry: NewPasswordEntry) -> Result<PasswordEntry> {
        use schema::passwords;

        let now = chrono::Utc::now().to_rfc3339();

        diesel::update(passwords::table.filter(passwords::id.eq(id)))
            .set((
                passwords::title.eq(&entry.title),
                passwords::username.eq(&entry.username),
                passwords::encrypted_password.eq(&entry.encrypted_password),
                passwords::url.eq(&entry.url),
                passwords::notes.eq(&entry.notes),
                passwords::category.eq(&entry.category),
                passwords::iv.eq(&entry.iv),
                passwords::tag.eq(&entry.tag),
                passwords::updated_at.eq(&now),
            ))
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        self.get_password(id)?
            .ok_or_else(|| anyhow::anyhow!("密码条目未找到"))
    }

    pub fn delete_password(&mut self, id: &str) -> Result<()> {
        use schema::passwords;

        diesel::delete(passwords::table.filter(passwords::id.eq(id)))
            .execute(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(())
    }

    pub fn list_passwords(&mut self) -> Result<Vec<PasswordEntry>> {
        use schema::passwords;

        let results = passwords::table
            .order(passwords::updated_at.desc())
            .load::<DatabasePassword>(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(results.into_iter().map(|p| p.into()).collect())
    }

    pub fn search_passwords(&mut self, query: &str) -> Result<Vec<PasswordEntry>> {
        use schema::passwords;
        use diesel::dsl::like;

        let pattern = format!("%{}%", query);

        let results = passwords::table
            .filter(
                passwords::title.like(&pattern)
                    .or(passwords::username.like(&pattern))
                    .or(passwords::url.like(&pattern))
            )
            .order(passwords::updated_at.desc())
            .load::<DatabasePassword>(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(results.into_iter().map(|p| p.into()).collect())
    }

    pub fn get_all_passwords_for_analysis(&mut self) -> Result<Vec<(String, String, String)>> {
        use schema::passwords;

        let results = passwords::table
            .select((passwords::id, passwords::title, passwords::encrypted_password))
            .load::<(String, String, String)>(&mut self.conn)
            .map_err(|e| DatabaseError::QueryError(e.to_string()))?;

        Ok(results)
    }
}

#[derive(Debug, Queryable, Insertable)]
#[diesel(table_name = schema::passwords)]
struct DatabasePassword {
    id: String,
    title: String,
    username: String,
    encrypted_password: String,
    url: Option<String>,
    notes: Option<String>,
    category: Option<String>,
    iv: String,
    tag: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = schema::passwords)]
struct DatabaseNewPassword {
    id: String,
    title: String,
    username: String,
    encrypted_password: String,
    url: Option<String>,
    notes: Option<String>,
    category: Option<String>,
    iv: String,
    tag: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Queryable)]
#[diesel(table_name = schema::emergency_contacts)]
struct DbEmergencyContactQuery {
    id: String,
    name: String,
    email: String,
    phone: Option<String>,
    share: String,
    created_at: String,
}

#[derive(Debug, Queryable)]
#[diesel(table_name = schema::emergency_config)]
struct DbEmergencyConfigQuery {
    id: i32,
    enabled: i32,
    threshold: i32,
    waiting_period_days: i64,
    master_key_hash: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Queryable)]
#[diesel(table_name = schema::recovery_requests)]
struct DbRecoveryRequestQuery {
    id: String,
    contact_id: String,
    verification_code: String,
    requested_at: String,
    approved: i32,
}

impl From<DatabasePassword> for PasswordEntry {
    fn from(p: DatabasePassword) -> Self {
        PasswordEntry {
            id: p.id,
            title: p.title,
            username: p.username,
            encrypted_password: p.encrypted_password,
            url: p.url,
            notes: p.notes,
            category: p.category,
            created_at: p.created_at,
            updated_at: p.updated_at,
            iv: p.iv,
            tag: p.tag,
        }
    }
}

pub mod schema {
    diesel::table! {
        passwords (id) {
            id -> Text,
            title -> Text,
            username -> Text,
            encrypted_password -> Text,
            url -> Nullable<Text>,
            notes -> Nullable<Text>,
            category -> Nullable<Text>,
            iv -> Text,
            tag -> Text,
            created_at -> Text,
            updated_at -> Text,
        }
    }

    diesel::table! {
        emergency_contacts (id) {
            id -> Text,
            name -> Text,
            email -> Text,
            phone -> Nullable<Text>,
            share -> Text,
            created_at -> Text,
        }
    }

    diesel::table! {
        emergency_config (id) {
            id -> Integer,
            enabled -> Integer,
            threshold -> Integer,
            waiting_period_days -> BigInt,
            master_key_hash -> Text,
            created_at -> Text,
            updated_at -> Text,
        }
    }

    diesel::table! {
        recovery_requests (id) {
            id -> Text,
            contact_id -> Text,
            verification_code -> Text,
            requested_at -> Text,
            approved -> Integer,
        }
    }
}
