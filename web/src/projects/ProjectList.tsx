import styles from "./ProjectList.module.scss";

type Props = {
    projects: { id: string; name: string }[];
};

export function ProjectList({ projects }: Props) {
    if (projects.length === 0) {
        return <p>No projects yet</p>;
    }

    return (
        <ul className={styles.list}>
            {projects.map((project) => (
                <li key={project.id}>{project.name}</li>
            ))}
        </ul>
    );
}