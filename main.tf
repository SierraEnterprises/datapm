variable "smtp_password" {
  description = "password for the SMTP server"
  type        = string
}

variable "APOLLO_KEY" {
  description = "Apollo GraphlQL Key"
  type        = string
}

locals {

  environments = {
    default = {
      media_bucket_name = "datapm-test-media"
      log_bucket_name   = "datapm-test-logging"
      log_object_prefix = "datapm-test"
      location          = "US"
      labels            = [{ "source" : "terraform" }]
      registry_name     = "DataPM Test"
    }
  }

  environmentvars = contains(keys(local.environments), terraform.workspace) ? terraform.workspace : "default"
  workspace       = merge(local.environments["default"], local.environments[local.environmentvars])
}

terraform {
  backend "gcs" {
    bucket = "datapm-registry-test"
    prefix = "test/state"
  }
}

data "google_billing_account" "acct" {
  display_name = "Big Armor Corporate"
  open         = true
}

resource "google_project" "project" {
  name            = "datapm TEST"
  project_id      = "datapm-test-terraform"
  billing_account = data.google_billing_account.acct.id
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_project_service" "service" {
  for_each = toset([
    "clouddebugger.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "datastore.googleapis.com",
    "storage-component.googleapis.com",
    "container.googleapis.com",
    "storage-api.googleapis.com",
    "logging.googleapis.com",
    "resourceviews.googleapis.com",
    "replicapool.googleapis.com",
    "replicapoolupdater.googleapis.com",
    "cloudapis.googleapis.com",
    "deploymentmanager.googleapis.com",
    "cloudbilling.googleapis.com",
    "containerregistry.googleapis.com",
    "sqladmin.googleapis.com",
    "monitoring.googleapis.com",
    "compute.googleapis.com",
    "sql-component.googleapis.com",
    "iam.googleapis.com",
    "cloudtrace.googleapis.com",
    "servicemanagement.googleapis.com",
    "run.googleapis.com",
    "dns.googleapis.com"
  ])

  service = each.key

  project            = google_project.project.project_id
  disable_on_destroy = false
}

resource "google_service_account" "cloudrun-sa" {
  account_id = "cloudrun-sa"
  project    = google_project.project.project_id
}
resource "google_project_iam_member" "cloudrun-sa-cloudsql-role" {
  project = google_project.project.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudrun-sa.email}"
}

resource "google_storage_bucket" "logging" {
  name          = local.workspace["log_bucket_name"]
  location      = local.workspace["location"]
  force_destroy = false
  project       = google_project.project.project_id

  lifecycle_rule {
    condition {
      age        = 365
      with_state = "ANY"
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "media" {
  name          = local.workspace["media_bucket_name"]
  location      = local.workspace["location"]
  force_destroy = false
  project       = google_project.project.project_id

  logging {
    log_bucket        = local.workspace["log_bucket_name"]
    log_object_prefix = "media"
  }

}


resource "google_storage_bucket_acl" "media-store-acl" {
  bucket = google_storage_bucket.media.name

  role_entity = [
    "OWNER:user-${google_service_account.cloudrun-sa.email}"
  ]
}


resource "google_cloud_run_service" "default" {
  name     = "datapm-registry"
  location = "us-central1"
  project  = google_project.project.project_id
  template {
    spec {
      service_account_name = google_service_account.cloudrun-sa.email
      containers {
        image = "gcr.io/${google_project.project.project_id}/datapm-registry"
        env {
          name  = "NODE_ENV"
          value = "production"
        }
        env {
          name  = "JWT_AUDIENCE"
          value = "test.datapm.io"
        }
        env {
          name  = "JWT_ISSUER"
          value = "test.datapm.io"
        }
        env {
          name  = "JWT_KEY"
          value = random_password.jwt_key.result
        }
        env {
          name  = "APOLLO_KEY"
          value = var.APOLLO_KEY
        }
        env {
          name  = "APOLLO_GRAPH_VARIANT"
          value = "dev"
        }
        env {
          name  = "GCLOUD_STORAGE_BUCKET_NAME"
          value = "media"
        }
        env {
          name  = "GOOGLE_CLOUD_PROJECT"
          value = google_project.project.project_id
        }
        env {
          name  = "MIXPANEL_TOKEN"
          value = "asdfasdfasdf"
        }
        env {
          name  = "TYPEORM_HOST"
          value = "/cloudsql/${google_project.project.project_id}:us-central1:${google_sql_database_instance.instance.name}"
        }
        env {
          name  = "TYPEORM_PORT"
          value = "5432"
        }
        env {
          name  = "TYPEORM_DATABASE"
          value = google_sql_database.database.name
        }
        env {
          name  = "TYPEORM_SCHEMA"
          value = "public"
        }
        env {
          name  = "TYPEORM_USERNAME"
          value = google_sql_user.user.name
        }
        env {
          name  = "TYPEORM_PASSWORD"
          value = google_sql_user.user.password
        }
        env {
          name  = "REGISTRY_NAME"
          value = "DataPM TEST Registry"
        }
        env {
          name  = "REGISTRY_URL"
          value = "https://test.datapm.io"
        }
        env {
          name  = "REGISTRY_HOSTNAME"
          value = "test.datapm.io"
        }
        env {
          name  = "TYPEORM_IS_DIST"
          value = "true"
        }
        env {
          name  = "SMTP_SERVER"
          value = "smtp.sendgrid.net"
        }
        env {
          name  = "SMTP_PORT"
          value = "465"
        }
        env {
          name  = "SMTP_USER"
          value = "apikey"
        }
        env {
          name  = "SMTP_PASSWORD"
          value = var.smtp_password
        }
        env {
          name  = "SMTP_FROM_NAME"
          value = "DataPM Support"
        }
        env {
          name  = "SMTP_FROM_ADDRESS"
          value = "support@datapm.io"
        }
        env {
          name  = "SMTP_SECURE"
          value = "true"
        }
        env {
          name  = "STORAGE_URL"
          value = "gs://${local.workspace["media_bucket_name"]}"
        }
        env {
          name  = "ACTIVITY_LOG"
          value = "true"
        }

        env {
          name  = "SCHEDULER_KEY"
          value = random_password.scheduler_key.result
        }
        env {
          name  = "LEADER_ELECTION_DISABLED"
          value = "true"
        }
      }
    }

    metadata {
      namespace = google_project.project.project_id
      annotations = {
        "autoscaling.knative.dev/minScale"      = "1"
        "autoscaling.knative.dev/maxScale"      = "2"
        "run.googleapis.com/cloudsql-instances" = "${google_project.project.project_id}:us-central1:${google_sql_database_instance.instance.name}"
        "run.googleapis.com/client-name"        = "terraform"
      }
    }
  }
  autogenerate_revision_name = true
}

data "google_iam_policy" "noauth" {
  binding {
    role = "roles/run.invoker"
    members = [
      "allUsers"
    ]
  }
}

resource "google_cloud_run_service_iam_policy" "noauth" {
  location = google_cloud_run_service.default.location
  project  = google_cloud_run_service.default.project
  service  = google_cloud_run_service.default.name

  policy_data = data.google_iam_policy.noauth.policy_data
}

resource "random_password" "scheduler_key" {
  length           = 16
  special          = true
  override_special = "_%@"
}

resource "random_password" "jwt_key" {
  length           = 16
  special          = true
  override_special = "_%@"
}

resource "random_password" "dbpassword" {
  length           = 16
  special          = true
  override_special = "_%@"
}

resource "google_sql_database_instance" "instance" {
  name             = "registry-v3"
  project          = google_project.project.project_id
  region           = "us-central1"
  database_version = "POSTGRES_12"
  settings {
    tier = "db-f1-micro"
    backup_configuration {
      enabled                        = true
      start_time                     = "01:00"
      point_in_time_recovery_enabled = true
    }

    ip_configuration {
      require_ssl = false
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_sql_user" "user" {
  depends_on = [
    google_sql_database_instance.instance
  ]

  name     = "postgres"
  project  = google_project.project.project_id
  instance = google_sql_database_instance.instance.name
  password = random_password.dbpassword.result
}

resource "google_sql_database" "database" {
  name     = "public"
  instance = google_sql_database_instance.instance.name
  project  = google_project.project.project_id
}

resource "google_cloud_run_domain_mapping" "default" {
  location = "us-central1"
  name     = "test.datapm.io"
  project  = google_project.project.project_id

  metadata {
    namespace = google_project.project.project_id
  }

  spec {
    route_name = google_cloud_run_service.default.name
  }
}


resource "google_cloud_scheduler_job" "instant_notifications_job" {
  name             = "datapm-instant-notifications"
  project          = google_project.project.project_id
  region           = "us-central1"
  description      = "To invoke sending daily notifications"
  schedule         = "* * * * *"
  time_zone        = "America/New_York"
  attempt_deadline = "320s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "https://test.datapm.io/graphql"
    body        = base64encode("{ \"query\":\"mutation { runJob(key: \"${random_password.scheduler_key.result}\", job: \"INSTANT_NOTIFICATIONS\") }\" }")
  }
}

resource "google_cloud_scheduler_job" "hourly_notifications_job" {
  name             = "datapm-hourly-notifications"
  project          = google_project.project.project_id
  region           = "us-central1"
  description      = "To invoke sending hourly notifications"
  schedule         = "0 * * * *"
  time_zone        = "America/New_York"
  attempt_deadline = "320s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "https://test.datapm.io/graphql"
    body        = base64encode("{ \"query\":\"mutation { runJob(key: \"${random_password.scheduler_key.result}\", job: \"HOURLY_NOTIFICATIONS\") }\" }")
  }
}

resource "google_cloud_scheduler_job" "daily_notifications_job" {
  name             = "datapm-daily-notifications"
  project          = google_project.project.project_id
  region           = "us-central1"
  description      = "To invoke sending daily notifications"
  schedule         = "0 8 * * *"
  time_zone        = "America/New_York"
  attempt_deadline = "320s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "https://test.datapm.io/graphql"
    body        = base64encode("{ \"query\":\"mutation { runJob(key: \"${random_password.scheduler_key.result}\", job: \"DAILY_NOTIFICATIONS\") }\" }")
  }
}

resource "google_cloud_scheduler_job" "weekly_notifications_job" {
  name             = "datapm-weekly-notifications"
  project          = google_project.project.project_id
  region           = "us-central1"
  description      = "To invoke sending weekly notifications"
  schedule         = "0 8 * * MON"
  time_zone        = "America/New_York"
  attempt_deadline = "320s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "https://test.datapm.io/graphql"
    body        = base64encode("{ \"query\":\"mutation { runJob(key: \"${random_password.scheduler_key.result}\", job: \"WEEKLY_NOTIFICATIONS\") }\" }")
  }
}


resource "google_cloud_scheduler_job" "monthly_notifications_job" {
  name             = "datapm-monthly-notifications"
  project          = google_project.project.project_id
  region           = "us-central1"
  description      = "To invoke sending monthly notifications"
  schedule         = "0 8 1 * *"
  time_zone        = "America/New_York"
  attempt_deadline = "320s"

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "https://test.datapm.io/graphql"
    body        = base64encode("{ \"query\":\"mutation { runJob(key: \"${random_password.scheduler_key.result}\", job: \"MONTHLY_NOTIFICATIONS\") }\" }")
  }
}
