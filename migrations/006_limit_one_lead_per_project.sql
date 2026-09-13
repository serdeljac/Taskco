create unique index memberships_one_lead_idx
    on memberships (project_id)
    where role = 'lead' and ended_at is null;