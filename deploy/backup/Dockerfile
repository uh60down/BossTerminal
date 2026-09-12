FROM alpine:3.20
# sqlite: provides the sqlite3 CLI's `.backup`, which uses SQLite's online
# backup API — safe to run against a live WAL-mode database without
# stopping the app. tzdata: so timestamped filenames use a real TZ if set.
# findutils: GNU find (not Alpine's default BusyBox applet) for `-mtime
# +N -delete` retention pruning — this runs unattended on a schedule, so
# it uses the find implementation with the most predictable, documented
# behavior for that flag combination rather than BusyBox's smaller applet.
RUN apk add --no-cache sqlite tzdata findutils
COPY backup-sqlite.sh /usr/local/bin/backup-sqlite.sh
RUN chmod +x /usr/local/bin/backup-sqlite.sh
ENTRYPOINT ["/usr/local/bin/backup-sqlite.sh"]
