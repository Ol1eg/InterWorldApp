
import { FetchUsers, fetchUser } from "@/lib/actions/user.actions";
import { currentUser } from "@clerk/nextjs";
import { redirect } from 'next/navigation';
import Image from "next/image";
import UserCard from "@/components/cards/UserCard";


async function Page() {
    const user = await currentUser();

    if (!user) return null;

    const userInfo = await fetchUser(user.id);

    if (!userInfo?.onboarded) redirect('/onboarding');

    //fetch users
    const result = await FetchUsers({
        userId: user.id,
        searchString: '',
        pageNumber: 1,
        pageSize: 25
    });
    return (
        <section>
            <h1 className="head-text mb-10">
                Search
            </h1>
            {/* search bar  */}
            <div className="mt-14 flex flex-col">
                {result.users.length === 0
                    ? (<p className="no-result">No User</p>)
                    : (
                        <>
                            {result.users.map((person) => (
                                <UserCard
                                    key={person.id}
                                    id={person.id}
                                    name={person.name}
                                    username={person.username}
                                    imgUrl={person.image}
                                    personType='User' />
                            ))}
                        </>
                    )}
            </div>
        </section>
    )
}

export default Page;