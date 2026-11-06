import styles from "./style/ProjectList.module.scss";
import { Link } from "react-router";

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
                <li key={project.id}>
                    <Link to={`/projects/${project.id}`}>{project.name}</Link>
                </li>
            ))}
        </ul>
    );
}