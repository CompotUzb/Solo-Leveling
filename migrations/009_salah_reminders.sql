create table if not exists salah_reminders (
  id text primary key,
  user_id text not null,
  date text not null,
  prayer_name text not null check (prayer_name in ('Fajr','Dhuhr','Asr','Maghrib','Isha')),
  reminder_kind text not null check (reminder_kind in ('pre5','start','late15','late30','followup')),
  scheduled_at text not null,
  status text not null default 'pending' check (status in ('pending','sent','cancelled')),
  sent_at text null,
  cancelled_at text null,
  created_at text not null,
  updated_at text not null,
  foreign key (user_id,date,prayer_name) references daily_salah(user_id,date,prayer_name) on delete cascade,
  unique (user_id,date,prayer_name,reminder_kind,scheduled_at)
);

create index if not exists idx_salah_reminders_due on salah_reminders(status,scheduled_at);
create index if not exists idx_salah_reminders_prayer on salah_reminders(user_id,date,prayer_name,status);
