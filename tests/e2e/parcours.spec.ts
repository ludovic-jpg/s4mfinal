import { expect, test, type Page } from "@playwright/test";

const MDP = "demonstration-s4m";

async function connecter(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(MDP);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("/");
}

async function tracerUneSignature(page: Page) {
  const zone = page.locator("canvas");
  const b = (await zone.boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(b.x + 30 + i * 7, b.y + b.height / 2 + Math.sin(i / 3) * 28);
  await page.mouse.up();
}

test("une URL protégée renvoie à la connexion ; un mauvais mot de passe est refusé proprement", async ({ page }) => {
  await page.goto("/formations");
  await expect(page).toHaveURL(/\/connexion/);
  await page.getByLabel("Adresse e-mail").fill("formatrice@demo.example");
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
});

test("formatrice : le pipeline montre les sept étapes, puis un dossier se crée en cinq choix", async ({ page }) => {
  await connecter(page, "formatrice@demo.example");
  for (const etape of ["Création du dossier Formation", "Demande de financement", "Début de la Formation", "Fin de la Formation", "Demande de paiement", "Paiement réceptionné", "Formateur payé / Dossier archivé"]) {
    await expect(page.getByRole("region", { name: etape })).toBeVisible();
  }

  await page.getByRole("button", { name: "Nouveau dossier" }).click();
  await page.getByRole("button", { name: /Léa Schmitt/ }).click();
  await page.getByRole("button", { name: /Continuer/ }).click();
  await expect(page.getByRole("button", { name: /Menuiserie Dupont/ })).toHaveAttribute("aria-pressed", "true"); // entreprise de l'apprenante proposée d'office
  await page.getByRole("button", { name: /Continuer/ }).click();
  await page.getByRole("button", { name: /Excel — tableaux croisés/ }).click();
  await page.getByRole("button", { name: /Continuer/ }).click();
  await page.getByRole("button", { name: /Continuer/ }).click();
  await page.getByRole("button", { name: "Créer le dossier" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Excel — tableaux croisés");
  await expect(page.getByText("À compléter avant de demander la validation")).toBeVisible();
  // RG-02 : le bouton de soumission existe mais reste bloqué, et dit pourquoi.
  const soumettre = page.getByRole("button", { name: "Demander la validation à l'organisme" });
  await expect(soumettre).toBeDisabled();
  await expect(soumettre).toHaveAttribute("title", /RG-02/);
});

test("apprenante : signe un document en ligne, et le statut passe à « Validé »", async ({ page }) => {
  await connecter(page, "apprenante@demo.example");
  await expect(page.getByRole("heading", { name: /Bonjour Anne/ })).toBeVisible();
  await page.getByRole("link", { name: /à traiter/ }).first().click();

  const ligne = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Signer" }) }).first();
  await expect(ligne.getByText("En attente de retour")).toBeVisible();
  const libelle = (await ligne.locator("p").first().innerText()).trim();
  await ligne.getByRole("button", { name: "Signer" }).click();

  const valider = page.getByRole("button", { name: "Signer le document" });
  await expect(valider).toBeDisabled(); // ni tracé, ni lieu, ni consentement
  await tracerUneSignature(page);
  await page.getByLabel("Fait à").fill("Mulhouse");
  await page.getByRole("checkbox").check();
  await valider.click();

  const apres = page.getByRole("listitem").filter({ hasText: libelle }).first();
  await expect(apres.getByText("Validé", { exact: true })).toBeVisible();
  await expect(apres.getByRole("link", { name: "Version retournée" })).toBeVisible();
  // L'apprenante ne voit ni l'espace OF, ni les finances, ni le journal.
  await expect(page.getByText("Communication avec l'OF")).toHaveCount(0);
  await expect(page.getByText("Net reversé au formateur")).toHaveCount(0);
});

test("admin : valide un dossier ; les pièces sont générées et l'e-mail à l'entreprise est consigné", async ({ page }) => {
  await connecter(page, "admin@demo.example");
  await page.getByRole("link", { name: /En cours de validation/ }).first().click();
  await page.getByRole("button", { name: "Valider le dossier" }).click();
  await expect(page.getByText("Dossier validé").first()).toBeVisible();

  await page.getByRole("tab", { name: /Communication Apprenant/ }).click();
  await expect(page.getByText("Convention de formation")).toBeVisible();
  await expect(page.getByText("Transmis")).toBeVisible(); // planning : transmis, sans statut de signature

  await page.getByRole("link", { name: "Boîte d'envoi" }).click();
  await expect(page.getByText("Pièces du financement").first()).toBeVisible();
});

test("mobile : aucun défilement horizontal de la page, menu en tiroir", async ({ browser }) => {
  for (const largeur of [320, 375, 768]) {
    const contexte = await browser.newContext({ viewport: { width: largeur, height: 760 } });
    const page = await contexte.newPage();
    await connecter(page, "formatrice@demo.example");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `largeur ${largeur}`).toBe(true);
    await page.locator("a[href^='/dossiers/']").first().click();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `dossier, largeur ${largeur}`).toBe(true);
    await contexte.close();
  }
});
