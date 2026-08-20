from datetime import datetime
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand

from core.current_affairs import can_run_daily_update, fetch_source_articles, generate_current_affairs_digest, save_current_affairs_digest, update_current_affairs


class Command(BaseCommand):
    help = "Fetch verified source articles and generate the daily AI current affairs digest."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Run even before 6:00 AM Asia/Kolkata.")
        parser.add_argument("--dry-run", action="store_true", help="Fetch and generate without saving records.")
        parser.add_argument("--count", type=int, default=8, help="Maximum current affairs items to save.")

    def handle(self, *args, **options):
        now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
        if not options["force"] and not can_run_daily_update(now_ist):
            self.stdout.write(self.style.WARNING("Skipped: daily update runs after 06:00 AM Asia/Kolkata."))
            return
        count = max(1, min(options["count"], 10))
        if options["dry_run"]:
            sources = fetch_source_articles()
            items, ai_stats = generate_current_affairs_digest(sources, target_count=count)
            validation = save_current_affairs_digest(items, sources, dry_run=True)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Current affairs dry run complete: {len(sources)} sources, "
                    f"{ai_stats['batches_attempted']} batches attempted, "
                    f"{ai_stats['batches_succeeded']} succeeded, {ai_stats['batches_failed']} failed, "
                    f"{len(items)} generated, {validation['validated']} validated, "
                    f"{validation['rejected']} rejected, {validation['duplicates']} duplicates, "
                    f"{validation['would_create']} would save, 0 saved."
                )
            )
            return
        result = update_current_affairs(target_count=count)
        self.stdout.write(
            self.style.SUCCESS(
                f"Current affairs update complete: {result['sources']} sources, "
                f"{result['batches_attempted']} batches attempted, "
                f"{result['batches_succeeded']} succeeded, {result['batches_failed']} failed, "
                f"{result['generated']} generated, {result['validated']} validated, "
                f"{result['rejected']} rejected, {result['duplicates']} duplicates, "
                f"{result['created']} saved."
            )
        )
