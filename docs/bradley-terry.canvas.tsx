import type { CSSProperties } from "react";
import {
	Button,
	Callout,
	Card,
	CardBody,
	CardHeader,
	Code,
	CollapsibleSection,
	computeDAGLayout,
	Divider,
	Grid,
	H1,
	H2,
	H3,
	Pill,
	Row,
	Stack,
	Stat,
	Table,
	Text,
	useCanvasAction,
	useCanvasState,
	useHostTheme,
	type CanvasHostTheme,
} from "cursor/canvas";

type SectionId =
	| "overview"
	| "architecture"
	| "api"
	| "library"
	| "config"
	| "deployment"
	| "testing"
	| "references";

const SECTIONS: Array<{ id: SectionId; label: string }> = [
	{ id: "overview", label: "Overview" },
	{ id: "architecture", label: "Architecture" },
	{ id: "api", label: "HTTP API" },
	{ id: "library", label: "Library" },
	{ id: "config", label: "Config & Secrets" },
	{ id: "deployment", label: "Deployment" },
	{ id: "testing", label: "Testing" },
	{ id: "references", label: "References" },
];

type DagDiagramProps = {
	nodes: Array<{ id: string }>;
	edges: Array<{ from: string; to: string }>;
	labels: Record<string, string>;
	theme: CanvasHostTheme;
	nodeWidth?: number;
	nodeHeight?: number;
};

function DagDiagram({
	nodes,
	edges,
	labels,
	theme,
	nodeWidth = 150,
	nodeHeight = 36,
}: DagDiagramProps) {
	const layout = computeDAGLayout({
		nodes,
		edges,
		direction: "vertical",
		nodeWidth,
		nodeHeight,
		rankGap: 48,
		nodeGap: 32,
		padding: 16,
	});

	const svgStyle: CSSProperties = {
		width: "100%",
		maxWidth: layout.width,
		height: layout.height,
	};

	return (
		<svg
			width={layout.width}
			height={layout.height}
			style={svgStyle}
			role="img"
			aria-label="Architecture diagram"
		>
			{layout.edges.map((edge) => (
				<line
					key={`${edge.from}-${edge.to}`}
					x1={edge.sourceX}
					y1={edge.sourceY}
					x2={edge.targetX}
					y2={edge.targetY}
					stroke={theme.stroke.secondary}
					strokeWidth={1.5}
					strokeDasharray={edge.isBackEdge ? "4 3" : undefined}
				/>
			))}
			{layout.nodes.map((node) => {
				const label = labels[node.id] ?? node.id;
				const fontSize = 11;
				const textX = node.x + nodeWidth / 2;
				const textY = node.y + nodeHeight / 2 + fontSize / 3;
				return (
					<g key={node.id}>
						<rect
							x={node.x}
							y={node.y}
							width={nodeWidth}
							height={nodeHeight}
							rx={4}
							fill={theme.fill.tertiary}
							stroke={theme.stroke.primary}
							strokeWidth={1}
						/>
						<text
							x={textX}
							y={textY}
							textAnchor="middle"
							fill={theme.text.secondary}
							fontSize={fontSize}
							fontFamily="system-ui, sans-serif"
						>
							{label}
						</text>
					</g>
				);
			})}
		</svg>
	);
}

function OpenFileButton({ path, label }: { path: string; label: string }) {
	const dispatch = useCanvasAction();
	return (
		<Button
			variant="ghost"
			onClick={() => dispatch({ type: "openFile", path })}
		>
			{label}
		</Button>
	);
}

function SectionNav({
	active,
	onSelect,
}: {
	active: SectionId;
	onSelect: (id: SectionId) => void;
}) {
	return (
		<Row gap={8} wrap>
			{SECTIONS.map(({ id, label }) => (
				<Pill key={id} active={active === id} onClick={() => onSelect(id)}>
					{label}
				</Pill>
			))}
		</Row>
	);
}

function OverviewSection() {
	return (
		<Stack gap={16}>
			<H2>Overview</H2>
			<Text>
				@platform/bradley-terry is a Bun-native, Effect-powered Bradley-Terry
				rating engine for sports intelligence. It fits maximum-likelihood
				strength ratings from win/loss match data using the Hunter (2004) MM
				algorithm, with graph-connectivity awareness, time decay, and multiple
				output scales.
			</Text>
			<Text tone="secondary">
				Audience: agents working in this repo, integrators embedding the
				library, and operators running the HTTP service.
			</Text>
			<Grid columns={2} gap={16}>
				<Card>
					<CardHeader>Library</CardHeader>
					<CardBody>
						<Text>
							Embeddable MM fitter via{" "}
							<Code>BradleyTerry.fit(matches)</Code>. Use Effect layers for
							dependency injection. No HTTP required.
						</Text>
					</CardBody>
				</Card>
				<Card>
					<CardHeader>HTTP service</CardHeader>
					<CardBody>
						<Text>
							Ingests Massey JSON, computes BT ratings via the production MM
							fitter, and persists snapshots in SQLite. Background scheduler
							auto-refreshes on interval.
						</Text>
					</CardBody>
				</Card>
			</Grid>
		</Stack>
	);
}

function ArchitectureSection() {
	const theme = useHostTheme();

	const layerNodes = [
		{ id: "config" },
		{ id: "massey" },
		{ id: "ratingsdb" },
		{ id: "btcompute" },
		{ id: "runtime" },
		{ id: "handlers" },
		{ id: "schema" },
	];
	const layerEdges = [
		{ from: "config", to: "massey" },
		{ from: "config", to: "ratingsdb" },
		{ from: "config", to: "btcompute" },
		{ from: "massey", to: "runtime" },
		{ from: "ratingsdb", to: "runtime" },
		{ from: "btcompute", to: "runtime" },
		{ from: "runtime", to: "handlers" },
		{ from: "handlers", to: "schema" },
	];
	const layerLabels: Record<string, string> = {
		config: "L0: RatingsConfig",
		massey: "MasseyClient",
		ratingsdb: "RatingsDB",
		btcompute: "BTCompute",
		runtime: "L2: ManagedRuntime",
		handlers: "L4: Bun.serve",
		schema: "L5: Effect Schema",
	};

	const refreshNodes = [
		{ id: "refresh" },
		{ id: "fetch" },
		{ id: "storeMassey" },
		{ id: "compute" },
		{ id: "storeBT" },
	];
	const refreshEdges = [
		{ from: "refresh", to: "fetch" },
		{ from: "fetch", to: "storeMassey" },
		{ from: "storeMassey", to: "compute" },
		{ from: "compute", to: "storeBT" },
	];
	const refreshLabels: Record<string, string> = {
		refresh: "POST /refresh",
		fetch: "MasseyClient.fetch",
		storeMassey: "storeMassey",
		compute: "BTCompute.compute",
		storeBT: "storeBT + history",
	};

	return (
		<Stack gap={16}>
			<H2>Architecture</H2>
			<Text>
				Six-layer Effect + Bun stack. Configuration fans out to services;
				services compose into a ManagedRuntime; handlers expose HTTP routes
				validated by Effect Schema.
			</Text>
			<DagDiagram
				nodes={layerNodes}
				edges={layerEdges}
				labels={layerLabels}
				theme={theme}
				nodeWidth={160}
			/>
			<H3>6-layer matrix</H3>
			<Table
				headers={["Layer", "Name", "Location", "Summary"]}
				rows={[
					["0", "Configuration", "service/config.ts", "RatingsConfig + SecretClient"],
					["1", "Services", "service/*", "MasseyClient, RatingsDB, BTCompute"],
					["2", "Effect Runtime", "server/runtime.ts", "ManagedRuntime + AppLive"],
					["3", "Error Channel", "service/errors.ts", "Tagged errors, catchTag"],
					["4", "HTTP Server", "server/handlers.ts", "Bun.serve routes + middleware"],
					["5", "Schema", "schema.ts", "EntityId, Match, FitResult SSOT"],
				]}
				striped
			/>
			<H3>Refresh pipeline</H3>
			<Text tone="secondary">
				Triggered by POST /api/ratings/refresh or the background scheduler.
			</Text>
			<DagDiagram
				nodes={refreshNodes}
				edges={refreshEdges}
				labels={refreshLabels}
				theme={theme}
				nodeWidth={170}
				nodeHeight={32}
			/>
			<Row gap={8}>
				<OpenFileButton path="docs/ARCHITECTURE.md" label="ARCHITECTURE.md" />
				<OpenFileButton path="AGENTS.md" label="AGENTS.md" />
			</Row>
		</Stack>
	);
}

function ApiSection() {
	return (
		<Stack gap={16}>
			<H2>HTTP API</H2>
			<Text>
				Base URL: <Code>http://localhost:3000</Code> (default PORT). Full
				reference in docs/API.md.
			</Text>
			<Table
				headers={["Method", "Path", "Description", "Auth"]}
				rows={[
					["GET", "/health", "Liveness probe — always 200", "None"],
					["GET", "/ready", "Readiness — 503 when DB down", "None"],
					["GET", "/metrics", "Prometheus counters", "None"],
					["GET", "/openapi.json", "OpenAPI 3.1 (JSON)", "None"],
					["GET", "/openapi.yaml", "OpenAPI 3.1 (YAML)", "None"],
					["GET", "/api/ratings/bt", "Current BT ratings (?sport=&season=)", "None"],
					["GET", "/api/ratings/history", "Historical snapshots", "None"],
					["POST", "/api/ratings/refresh", "Fetch Massey → compute → store", "REFRESH_TOKEN optional"],
				]}
				striped
			/>
			<Callout tone="info" title="OpenAPI">
				<Text>
					Live spec at <Code>/openapi.json</Code>. Source:{" "}
					<Code>docs/openapi.yaml</Code>.
				</Text>
			</Callout>
			<Row gap={8}>
				<OpenFileButton path="docs/API.md" label="Full API reference" />
				<OpenFileButton path="docs/openapi.yaml" label="openapi.yaml" />
				<OpenFileButton path="src/server/handlers.ts" label="handlers.ts" />
			</Row>
		</Stack>
	);
}

function LibrarySection() {
	return (
		<Stack gap={16}>
			<H2>Library quick start</H2>
			<Text>
				Import <Code>BradleyTerry</Code> and <Code>BradleyTerryLive</Code>,
				provide matches, and run via Effect:
			</Text>
			<Card>
				<CardHeader>examples/usage-complete.ts</CardHeader>
				<CardBody>
					<Text>
						<Code>const bt = yield* BradleyTerry;</Code>
					</Text>
					<Text>
						<Code>return yield* bt.fit(matches);</Code>
					</Text>
					<Text tone="secondary" size="small">
						Returns FitResult with ratings Map, logLikelihood, iterations.
					</Text>
				</CardBody>
			</Card>
			<H3>BradleyTerry.fit config options</H3>
			<Table
				headers={["Option", "Default", "Description"]}
				rows={[
					["maxIterations", "150", "MM algorithm iteration cap"],
					["tolerance", "1e-6", "Convergence threshold"],
					["normalize", "true", "Normalize ratings after fit"],
					["timeDecayHalfLifeDays", "undefined", "Optional exponential time decay"],
					["outputScale", "arithmetic", "arithmetic | geometric | elo400"],
				]}
				striped
			/>
			<Text>
				Also available:{" "}
				<Code>BradleyTerry.predictWinProbability(ratings, a, b)</Code>
			</Text>
			<Row gap={8}>
				<OpenFileButton
					path="src/bradley-terry/index.ts"
					label="bradley-terry/index.ts"
				/>
				<OpenFileButton
					path="examples/usage-complete.ts"
					label="usage-complete.ts"
				/>
			</Row>
		</Stack>
	);
}

function ConfigSection() {
	return (
		<Stack gap={16}>
			<H2>Configuration and secrets</H2>
			<Text>
				Copy <Code>.env.example</Code> to <Code>.env</Code> for local
				development. Bun loads it automatically.
			</Text>
			<Table
				headers={["Variable", "Default", "Purpose"]}
				rows={[
					["PORT", "3000", "HTTP listen port"],
					["DB_PATH", "./data/ratings.db", "SQLite file path"],
					["MASSEY_URL", "Massey JSON endpoint", "Upstream data source"],
					["SECRETS_BACKEND", "auto", "auto | env | bun | vault"],
					["REFRESH_INTERVAL", "3600", "Auto-refresh seconds (0 = off)"],
					["REFRESH_RATE_LIMIT", "5", "Max manual refresh per IP per window"],
					["REFRESH_RATE_WINDOW", "60", "Rate limit window (seconds)"],
					["REFRESH_TOKEN", "—", "Protect POST /refresh (optional)"],
					["REQUEST_LOG", "true", "JSON request logs to stdout"],
					["CORS_ORIGIN", "*", "CORS allow-origin header"],
				]}
				striped
			/>
			<Callout tone="info" title="Credentials vs config">
				<Text>
					API tokens and encryption passphrases load via SecretClient at
					bootstrap — they are not stored in RatingsConfig fields.
				</Text>
			</Callout>
			<Card collapsible defaultOpen={false}>
				<CardHeader>Secret namespaces</CardHeader>
				<CardBody>
					<Stack gap={8}>
						<Text>
							<Code>com.bradley-terry.massey / api-token</Code>
						</Text>
						<Text>
							<Code>com.bradley-terry.db / encryption-passphrase</Code>
						</Text>
						<Divider />
						<Text size="small" tone="secondary">
							CLI:{" "}
							<Code>
								bun run secret set com.bradley-terry.massey api-token
								&quot;token&quot;
							</Code>
						</Text>
					</Stack>
				</CardBody>
			</Card>
			<Row gap={8}>
				<OpenFileButton path=".env.example" label=".env.example" />
				<OpenFileButton path="src/secrets/client.ts" label="SecretClient" />
				<OpenFileButton path="src/service/config.ts" label="config.ts" />
			</Row>
		</Stack>
	);
}

function DeploymentSection() {
	return (
		<Stack gap={16}>
			<H2>Deployment and ops</H2>
			<Text>
				Docker image built from Dockerfile. Mount a persistent volume for
				DB_PATH. Set MASSEY_API_TOKEN and REFRESH_TOKEN in production.
			</Text>
			<H3>Health probes</H3>
			<Table
				headers={["Endpoint", "Use", "Success", "Handler"]}
				rows={[
					["GET /health", "Liveness", "Always 200", "server/handlers.ts"],
					["GET /ready", "Readiness", "200 when DB ok", "server/handlers.ts"],
					["GET /metrics", "Observability", "Prometheus text", "server/metrics.ts"],
				]}
				striped
			/>
			<Callout tone="info" title="Scaling caveats">
				<Text>
					SQLite is single-writer — one replica per DB_PATH. Rate limits and
					refresh locks are in-process; use edge rate limiting for
					multi-replica deployments.
				</Text>
			</Callout>
			<Row gap={8}>
				<OpenFileButton path="docs/DEPLOYMENT.md" label="DEPLOYMENT.md" />
				<OpenFileButton path="Dockerfile" label="Dockerfile" />
			</Row>
		</Stack>
	);
}

function TestingSection() {
	return (
		<Stack gap={16}>
			<H2>Testing and benchmarks</H2>
			<Grid columns={3} gap={16}>
				<Stat value="46+" label="Integration (tests/)" tone="success" />
				<Stat value="fast-check" label="Property (test/property/)" tone="info" />
				<Stat value="87ms" label="50k-match bench" />
			</Grid>
			<Table
				headers={["Command", "Purpose"]}
				rows={[
					["bun test", "Run all tests"],
					["bun run ci", "test + lint"],
					["bun run check:full", "completions + lint + bench"],
					["bun run bench", "BT fit performance benchmark"],
				]}
				striped
			/>
			<Callout tone="warning" title="Known gaps">
				<Stack gap={8}>
					<Text>
						SqliteLoader is a stub — returns empty array (
						<Code>src/repository/sqlite-loader.ts</Code>).
					</Text>
					<Text>
						cascade-mover integration is referenced in docs but absent from
						this snapshot.
					</Text>
				</Stack>
			</Callout>
			<Row gap={8}>
				<OpenFileButton path="tests/" label="tests/" />
				<OpenFileButton path="test/property/" label="test/property/" />
			</Row>
		</Stack>
	);
}

function ReferencesSection() {
	return (
		<Stack gap={16}>
			<H2>References</H2>
			<Text tone="secondary">
				Source docs and key entry points for deeper reading.
			</Text>
			<Row gap={8} wrap>
				<OpenFileButton path="README.md" label="README.md" />
				<OpenFileButton path="docs/ARCHITECTURE.md" label="ARCHITECTURE.md" />
				<OpenFileButton path="docs/API.md" label="API.md" />
				<OpenFileButton path="docs/DEPLOYMENT.md" label="DEPLOYMENT.md" />
				<OpenFileButton path="docs/BUN_RUNTIME.md" label="BUN_RUNTIME.md" />
				<OpenFileButton path="AGENTS.md" label="AGENTS.md" />
				<OpenFileButton path="CHANGELOG.md" label="CHANGELOG.md" />
				<OpenFileButton path="src/server/index.ts" label="server/index.ts" />
				<OpenFileButton path="src/index.ts" label="src/index.ts" />
			</Row>
		</Stack>
	);
}

function SectionContent({ id }: { id: SectionId }) {
	switch (id) {
		case "overview":
			return <OverviewSection />;
		case "architecture":
			return <ArchitectureSection />;
		case "api":
			return <ApiSection />;
		case "library":
			return <LibrarySection />;
		case "config":
			return <ConfigSection />;
		case "deployment":
			return <DeploymentSection />;
		case "testing":
			return <TestingSection />;
		case "references":
			return <ReferencesSection />;
	}
}

export default function BradleyTerryDocs() {
	const [activeSection, setActiveSection] = useCanvasState<SectionId>(
		"activeSection",
		"overview",
	);

	return (
		<Stack gap={24}>
			<H1>@platform/bradley-terry</H1>
			<Text>
				Bun-native, Effect-powered Bradley-Terry rating engine — dual role as
				embeddable library and integrated HTTP service for sports intelligence.
			</Text>

			<Grid columns={4} gap={16}>
				<Stat value="0.3.33" label="Version" />
				<Stat value="154+" label="Tests" tone="success" />
				<Stat value="87ms" label="50k-match bench" tone="info" />
				<Stat value="Bun 1.4" label="Effect 3.21" />
			</Grid>

			<Row gap={8} wrap>
				<Pill active>Bradley-Terry</Pill>
				<Pill>Effect</Pill>
				<Pill>Bun</Pill>
				<Pill>SQLite</Pill>
				<Pill>Massey</Pill>
			</Row>

			<Divider />

			<H3>Contents</H3>
			<SectionNav active={activeSection} onSelect={setActiveSection} />

			<Divider />

			{SECTIONS.map(({ id, label }) => (
				<CollapsibleSection
					key={`${id}-${activeSection}`}
					title={label}
					defaultOpen={activeSection === id}
				>
					<SectionContent id={id} />
				</CollapsibleSection>
			))}
		</Stack>
	);
}
