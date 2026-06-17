import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return { showForm: Boolean(login) };
};

export default function LandingPage() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>BargainBot</h1>
        <p className={styles.text}>
          Let customers negotiate prices on your Shopify store. Set your rules,
          the bot handles every deal — automatically.
        </p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Install BargainBot
            </button>
          </Form>
        )}

        <ul className={styles.list}>
          <li>
            <strong>Set bargaining rules per product.</strong>{" "}
            Configure discount limits, quantity tiers, and how many rounds the bot will negotiate.
          </li>
          <li>
            <strong>Chat widget on product pages.</strong>{" "}
            Customers type naturally — the bot responds with real offers based on your rules.
          </li>
          <li>
            <strong>Deals close automatically.</strong>{" "}
            When a customer accepts, a one-time discount code is generated and applied at checkout instantly.
          </li>
        </ul>
      </div>
    </div>
  );
}
