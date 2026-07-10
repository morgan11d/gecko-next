from app.store import store


if __name__ == "__main__":
    store.seed()
    print(f"Seeded demo users={len(store.users)} projects={len(store.projects)} tasks={len(store.tasks)}")

