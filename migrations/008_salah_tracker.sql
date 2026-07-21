create table if not exists salah_days (
  user_id text not null references users(user_id) on delete cascade,
  local_date text not null,
  thread_id text null,
  discord_message_id text null,
  archived integer not null default 0 check (archived in (0,1)),
  all_rewards_granted integer not null default 0 check (all_rewards_granted in (0,1)),
  evaluated integer not null default 0 check (evaluated in (0,1)),
  created_at text not null,
  updated_at text not null,
  primary key (user_id, local_date)
);

create table if not exists daily_salah (
  id text primary key,
  user_id text not null,
  date text not null,
  prayer_name text not null check (prayer_name in ('Fajr','Dhuhr','Asr','Maghrib','Isha')),
  scheduled_time text not null,
  completed integer not null default 0 check (completed in (0,1)),
  completed_at text null,
  discord_message_id text null,
  thread_id text null,
  created_at text not null,
  updated_at text not null,
  foreign key (user_id,date) references salah_days(user_id,local_date) on delete cascade,
  unique (user_id,date,prayer_name),
  unique (discord_message_id)
);

create table if not exists salah_state (
  user_id text primary key references users(user_id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_evaluated_date text null,
  updated_at text not null
);

create index if not exists idx_daily_salah_date on daily_salah(date);
create index if not exists idx_daily_salah_completed on daily_salah(completed);
create index if not exists idx_daily_salah_thread on daily_salah(thread_id);
