import {
  type CustomerMutation,
  type Customer,
  type CustomerSearch,
  type CustomerUpdate,
} from "../domain/customer.ts";

export class CustomerHttpClient {
  private baseUrl: string;
  constructor(baseURL: string) {
    this.baseUrl = baseURL;
  }

  async listCustomers(): Promise<Customer[]> {
    const response = await fetch(`${this.baseUrl}/customers`);
    return (await response.json()) as Promise<Customer[]>;
  }

  async createCustomer(
    customer: Omit<Customer, "_id">,
  ): Promise<CustomerMutation> {
    const response = await fetch(`${this.baseUrl}/customers`, {
      method: "POST",
      body: JSON.stringify(customer),
      headers: {
        "Content-Type": "application/json",
      },
    });
    return (await response.json()) as Promise<CustomerMutation>;
  }

  async getCustomerById(id: string): Promise<Customer | null> {
    const response = await fetch(`${this.baseUrl}/customers/${id}`);

    if (response.status === 404) return null;

    return (await response.json()) as Customer;
  }

  async updateCustomer(customer: CustomerUpdate): Promise<CustomerMutation> {
    const { _id, ...remaining } = customer;
    const response = await fetch(`${this.baseUrl}/customers/${_id}`, {
      method: "PUT",
      body: JSON.stringify(remaining),
      headers: {
        "Content-Type": "application/json",
      },
    });
    return (await response.json()) as Promise<CustomerMutation>;
  }

  async deleteCustomer(id: string): Promise<CustomerMutation> {
    const response = await fetch(`${this.baseUrl}/customers/${id}`, {
      method: "DELETE",
    });
    return (await response.json()) as Promise<CustomerMutation>;
  }
}
